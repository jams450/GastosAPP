using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Transactions;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.BusinessLogic.Services
{
    public class CreditLifecycleService : ICreditLifecycleService
    {
        private readonly IRepository _repository;
        private readonly IAccountService _accountService;
        private readonly ITransactionValidationService _validation;
        private readonly ICreditCycleService _creditCycleService;

        public CreditLifecycleService(
            IRepository repository,
            IAccountService accountService,
            ITransactionValidationService validation,
            ICreditCycleService creditCycleService)
        {
            _repository = repository;
            _accountService = accountService;
            _validation = validation;
            _creditCycleService = creditCycleService;
        }

        public async Task<(bool Success, string? ErrorMessage)> RegisterCreditPaymentAsync(int creditAccountId, int sourceTransactionId, DateTime paidAt, decimal amount, IEnumerable<(int InstallmentId, decimal Amount)> allocations)
        {
            if (amount <= 0) return (false, "El monto del pago debe ser mayor a cero");

            var allocationList = allocations.Where(a => a.InstallmentId > 0 && a.Amount > 0).ToList();
            if (allocationList.Count == 0) return (false, "Debes asignar al menos una mensualidad");
            if (allocationList.Sum(a => a.Amount) != amount) return (false, "La suma de asignaciones debe coincidir con monto del pago");

            var account = await _accountService.GetByIdAsync(creditAccountId);
            if (account == null || !account.IsCredit) return (false, "La cuenta destino no es de crédito");

            var sourceTransaction = await _repository.Get<Transaction>(t => t.TransactionId == sourceTransactionId).FirstOrDefaultAsync();
            if (sourceTransaction == null) return (false, "No existe transacción origen para aplicar pago de crédito");

            var existingPayment = await _repository.GetTrack<CreditPayment>().FirstOrDefaultAsync(p => p.SourceTransactionId == sourceTransactionId);
            var maxAllowedFromSource = sourceTransaction.Amount;
            if ((existingPayment != null && existingPayment.Amount + amount > maxAllowedFromSource) || (existingPayment == null && amount > maxAllowedFromSource))
            {
                return (false, "La aplicación excede monto disponible de transacción origen");
            }

            var installmentIds = allocationList.Select(a => a.InstallmentId).Distinct().ToList();
            var installments = await _repository.GetTrack<CreditInstallment>().Include(i => i.Plan).Where(i => installmentIds.Contains(i.InstallmentId)).ToListAsync();
            if (installments.Count != installmentIds.Count) return (false, "Hay mensualidades inválidas en la asignación");
            if (installments.Any(i => i.Plan.AccountId != creditAccountId)) return (false, "Todas las mensualidades deben pertenecer a la misma cuenta crédito");

            var paidByInstallment = await _repository.Get<InstallmentAllocation>(a => installmentIds.Contains(a.InstallmentId))
                .GroupBy(a => a.InstallmentId)
                .Select(g => new { InstallmentId = g.Key, Paid = g.Sum(x => x.AllocatedAmount) })
                .ToDictionaryAsync(x => x.InstallmentId, x => x.Paid);

            foreach (var allocation in allocationList)
            {
                var installment = installments.First(i => i.InstallmentId == allocation.InstallmentId);
                var paidAmount = paidByInstallment.TryGetValue(installment.InstallmentId, out var currentPaid) ? currentPaid : 0m;
                var remaining = installment.TotalDue - paidAmount;
                if (allocation.Amount > remaining) return (false, $"La asignación excede saldo pendiente en mensualidad {installment.InstallmentNumber}");
            }

            CreditPayment creditPayment;
            if (existingPayment == null)
            {
                creditPayment = await _repository.Save(new CreditPayment
                {
                    AccountId = creditAccountId,
                    SourceTransactionId = sourceTransactionId,
                    PaidAt = _validation.EnsureUtc(paidAt),
                    Amount = amount,
                    Status = TransactionDomainConstants.CreditStatus.Posted
                });
            }
            else
            {
                existingPayment.Amount += amount;
                creditPayment = existingPayment;
            }

            var createdAllocations = allocationList.Select(a => new InstallmentAllocation
            {
                PaymentId = creditPayment.PaymentId,
                InstallmentId = a.InstallmentId,
                AllocatedAmount = a.Amount
            }).ToList();

            _repository.GetTrack<InstallmentAllocation>().AddRange(createdAllocations);
            await _repository.SaveChangesAsync();

            await RecalculateInstallmentStatusesAsync(installmentIds);
            return (true, null);
        }

        public async Task<(bool Success, string? ErrorMessage)> ConvertChargeToMsiAsync(int sourceTransactionId, int months)
        {
            if (months <= 1) return (false, "Meses MSI debe ser mayor a 1");

            var charge = await _repository.GetTrack<CreditCharge>()
                .Include(c => c.InstallmentPlan)
                .ThenInclude(p => p!.Installments)
                .FirstOrDefaultAsync(c => c.SourceTransactionId == sourceTransactionId);
            if (charge == null) return (false, "No existe cargo de crédito para esa transacción");
            if (charge.InstallmentPlan == null) return (false, "Cargo sin plan de pagos");

            var account = await _accountService.GetByIdAsync(charge.AccountId);
            if (account == null || !account.IsCredit) return (false, "La cuenta indicada no es de crédito");

            var plan = charge.InstallmentPlan;
            var hasPayments = await _repository.Get<InstallmentAllocation>(a => plan.Installments.Select(i => i.InstallmentId).Contains(a.InstallmentId)).AnyAsync();
            if (hasPayments) return (false, "No se puede convertir a MSI un cargo con pagos ya asignados");

            var oldInstallments = plan.Installments.ToList();
            if (oldInstallments.Count > 0)
            {
                _repository.GetTrack<CreditInstallment>().RemoveRange(oldInstallments);
            }

            plan.PlanType = TransactionDomainConstants.CreditPlanType.Msi;
            plan.Months = months;
            plan.MonthlyAmountBase = Math.Round(charge.PrincipalAmount / months, 2, MidpointRounding.AwayFromZero);
            plan.RoundingResidual = charge.PrincipalAmount - (plan.MonthlyAmountBase * months);

            var chargeCycle = await _creditCycleService.ResolveChargeCycleAsync(account, charge.OccurredAt);
            var dueCycles = await _creditCycleService.ResolveDueCyclesAsync(account, charge.OccurredAt, months);
            charge.CycleId = chargeCycle.CycleId;
            plan.StartCycleId = chargeCycle.CycleId;

            var installments = BuildInstallments(plan, dueCycles);
            _repository.GetTrack<CreditInstallment>().AddRange(installments);
            await _repository.SaveChangesAsync();
            return (true, null);
        }

        public async Task<(bool Success, string? ErrorMessage, int CreatedCount)> CreateOpeningCreditChargesAsync(int creditAccountId, IEnumerable<OpeningCreditChargeInput> items)
        {
            var account = await _accountService.GetByIdAsync(creditAccountId);
            if (account == null || !account.IsCredit) return (false, "La cuenta indicada no es de crédito", 0);

            var normalized = items.Where(i => i.Amount > 0 && i.CategoryId > 0).Select(i => new OpeningCreditChargeInput
            {
                CategoryId = i.CategoryId,
                Amount = decimal.Round(i.Amount, 2, MidpointRounding.AwayFromZero),
                Months = i.Months <= 0 ? 1 : i.Months,
                Description = string.IsNullOrWhiteSpace(i.Description) ? "Saldo inicial heredado" : i.Description!.Trim(),
                OccurredAt = i.OccurredAt
            }).ToList();

            if (normalized.Count == 0) return (false, "Debes enviar al menos un cargo con monto mayor a cero", 0);
            if (normalized.Any(i => i.Months < 1 || i.Months > 60)) return (false, "Meses inválido. Debe estar entre 1 y 60", 0);

            foreach (var input in normalized)
            {
                var occurredAt = _validation.EnsureUtc(input.OccurredAt ?? DateTime.UtcNow);
                var syntheticTransaction = await _repository.Save(new Transaction
                {
                    AccountId = creditAccountId,
                    CategoryId = input.CategoryId,
                    Type = TransactionDomainConstants.TransactionType.OpeningCredit,
                    Amount = input.Amount,
                    BalanceImpact = 0m,
                    Direction = TransactionDomainConstants.Direction.Credit,
                    Description = input.Description,
                    TransactionDate = occurredAt
                });

                await CreateCreditChargeWithPlanAsync(syntheticTransaction, input.Months, input.Months > 1 ? TransactionDomainConstants.CreditPlanType.Msi : TransactionDomainConstants.CreditPlanType.Revolving);
            }

            return (true, null, normalized.Count);
        }

        public async Task CreateCreditChargeWithPlanAsync(Transaction transaction, int months, string planType)
        {
            var account = await _accountService.GetByIdAsync(transaction.AccountId);
            if (account == null || !account.IsCredit)
            {
                throw new InvalidOperationException("La cuenta indicada no es de crédito");
            }

            var normalizedMonths = Math.Max(months, 1);
            var chargeCycle = await _creditCycleService.ResolveChargeCycleAsync(account, transaction.TransactionDate);
            var dueCycles = await _creditCycleService.ResolveDueCyclesAsync(account, transaction.TransactionDate, normalizedMonths);

            var charge = await _repository.Save(new CreditCharge
            {
                AccountId = transaction.AccountId,
                SourceTransactionId = transaction.TransactionId,
                CycleId = chargeCycle.CycleId,
                OccurredAt = transaction.TransactionDate,
                PrincipalAmount = transaction.Amount,
                Status = TransactionDomainConstants.CreditStatus.Open
            });

            var monthlyAmountBase = Math.Round(transaction.Amount / normalizedMonths, 2, MidpointRounding.AwayFromZero);
            var roundingResidual = transaction.Amount - (monthlyAmountBase * normalizedMonths);

            var plan = await _repository.Save(new CreditInstallmentPlan
            {
                AccountId = transaction.AccountId,
                SourceChargeId = charge.ChargeId,
                PlanType = planType,
                Months = normalizedMonths,
                PrincipalAmount = transaction.Amount,
                MonthlyAmountBase = monthlyAmountBase,
                RoundingResidual = roundingResidual,
                StartCycleId = chargeCycle.CycleId,
                Status = TransactionDomainConstants.CreditStatus.Active
            });

            var installments = BuildInstallments(plan, dueCycles);
            _repository.GetTrack<CreditInstallment>().AddRange(installments);
            await _repository.SaveChangesAsync();
        }

        public async Task SynchronizeCreditChargePlanAsync(int sourceTransactionId, decimal newAmount, DateTime newTransactionDate)
        {
            var charge = await _repository.GetTrack<CreditCharge>()
                .Include(c => c.InstallmentPlan)
                .ThenInclude(p => p!.Installments)
                .FirstOrDefaultAsync(c => c.SourceTransactionId == sourceTransactionId);
            if (charge?.InstallmentPlan == null) return;

            var account = await _accountService.GetByIdAsync(charge.AccountId);
            if (account == null || !account.IsCredit) return;

            var plan = charge.InstallmentPlan;
            var months = Math.Max(plan.Months, 1);
            var normalizedTransactionDate = _validation.EnsureUtc(newTransactionDate);
            var chargeCycle = await _creditCycleService.ResolveChargeCycleAsync(account, normalizedTransactionDate);
            var dueCycles = await _creditCycleService.ResolveDueCyclesAsync(account, normalizedTransactionDate, months);

            charge.PrincipalAmount = newAmount;
            charge.OccurredAt = normalizedTransactionDate;
            charge.CycleId = chargeCycle.CycleId;

            var monthlyAmountBase = Math.Round(newAmount / months, 2, MidpointRounding.AwayFromZero);
            var roundingResidual = newAmount - (monthlyAmountBase * months);

            plan.PrincipalAmount = newAmount;
            plan.MonthlyAmountBase = monthlyAmountBase;
            plan.RoundingResidual = roundingResidual;
            plan.StartCycleId = chargeCycle.CycleId;

            var orderedInstallments = plan.Installments.OrderBy(i => i.InstallmentNumber).ToList();
            if (orderedInstallments.Count != months) return;

            foreach (var installment in orderedInstallments)
            {
                var totalDue = monthlyAmountBase;
                if (installment.InstallmentNumber == months) totalDue += roundingResidual;

                var dueCycle = dueCycles[installment.InstallmentNumber - 1];
                installment.DueCycleId = dueCycle.CycleId;
                installment.DueDate = dueCycle.DueAt;
                installment.PrincipalDue = totalDue;
                installment.InterestDue = 0m;
                installment.FeeDue = 0m;
                installment.TotalDue = totalDue;
            }

            await _repository.SaveChangesAsync();
            await RecalculateInstallmentStatusesAsync(orderedInstallments.Select(i => i.InstallmentId));
        }

        private List<CreditInstallment> BuildInstallments(CreditInstallmentPlan plan, IReadOnlyList<CreditCycle> dueCycles)
        {
            var installments = new List<CreditInstallment>(dueCycles.Count);
            for (var installmentNumber = 1; installmentNumber <= dueCycles.Count; installmentNumber++)
            {
                var totalDue = plan.MonthlyAmountBase;
                if (installmentNumber == dueCycles.Count) totalDue += plan.RoundingResidual;

                var dueCycle = dueCycles[installmentNumber - 1];
                installments.Add(new CreditInstallment
                {
                    PlanId = plan.PlanId,
                    InstallmentNumber = installmentNumber,
                    DueCycleId = dueCycle.CycleId,
                    DueDate = dueCycle.DueAt,
                    PrincipalDue = totalDue,
                    InterestDue = 0m,
                    FeeDue = 0m,
                    TotalDue = totalDue,
                    Status = TransactionDomainConstants.CreditStatus.Open
                });
            }

            return installments;
        }

        private async Task RecalculateInstallmentStatusesAsync(IEnumerable<int> installmentIds)
        {
            var ids = installmentIds.Distinct().ToList();
            if (ids.Count == 0) return;

            var installments = await _repository.GetTrack<CreditInstallment>().Where(i => ids.Contains(i.InstallmentId)).ToListAsync();
            var paidRows = await _repository.Get<InstallmentAllocation>(a => ids.Contains(a.InstallmentId))
                .GroupBy(a => a.InstallmentId)
                .Select(g => new { InstallmentId = g.Key, Paid = g.Sum(x => x.AllocatedAmount) })
                .ToListAsync();
            var paidByInstallment = paidRows.ToDictionary(x => x.InstallmentId, x => x.Paid);

            foreach (var installment in installments)
            {
                var paid = paidByInstallment.TryGetValue(installment.InstallmentId, out var value) ? value : 0m;
                installment.Status = paid switch
                {
                    <= 0m => TransactionDomainConstants.CreditStatus.Open,
                    _ when paid >= installment.TotalDue => TransactionDomainConstants.CreditStatus.Paid,
                    _ => TransactionDomainConstants.CreditStatus.PartiallyPaid
                };
            }

            await _repository.SaveChangesAsync();

            var planIds = installments.Select(i => i.PlanId).Distinct().ToList();
            var plans = await _repository.GetTrack<CreditInstallmentPlan>()
                .Include(p => p.Installments)
                .Include(p => p.SourceCharge)
                .Where(p => planIds.Contains(p.PlanId))
                .ToListAsync();

            foreach (var plan in plans)
            {
                var allPaid = plan.Installments.All(i => i.Status == TransactionDomainConstants.CreditStatus.Paid);
                var anyPaid = plan.Installments.Any(i => i.Status == TransactionDomainConstants.CreditStatus.Paid || i.Status == TransactionDomainConstants.CreditStatus.PartiallyPaid);
                plan.Status = allPaid ? TransactionDomainConstants.CreditStatus.Completed : TransactionDomainConstants.CreditStatus.Active;

                if (plan.SourceCharge != null)
                {
                    plan.SourceCharge.Status = allPaid
                        ? TransactionDomainConstants.CreditStatus.Paid
                        : anyPaid
                            ? TransactionDomainConstants.CreditStatus.PartiallyPaid
                            : TransactionDomainConstants.CreditStatus.Open;
                }
            }

            await _repository.SaveChangesAsync();
        }
    }
}
