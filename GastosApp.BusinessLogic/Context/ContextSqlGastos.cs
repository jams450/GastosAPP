using Microsoft.EntityFrameworkCore;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;
using GastosApp.Models.Models;

namespace GastosApp.BusinessLogic.Context
{
    public class ContextSqlGastos : DbContext
    {
        private readonly ICurrentUserService _currentUser;

        public ContextSqlGastos(DbContextOptions<ContextSqlGastos> options, ICurrentUserService currentUser)
            : base(options)
        {
            _currentUser = currentUser;
        }

        public DbSet<User> Users { get; set; } = null!;
        public DbSet<UserSession> UserSessions { get; set; } = null!;
        public DbSet<Account> Accounts { get; set; } = null!;
        public DbSet<Category> Categories { get; set; } = null!;
        public DbSet<Subcategory> Subcategories { get; set; } = null!;
        public DbSet<Merchant> Merchants { get; set; } = null!;
        public DbSet<Tag> Tags { get; set; } = null!;
        public DbSet<CategoryTag> CategoryTags { get; set; } = null!;
        public DbSet<TransactionTag> TransactionTags { get; set; } = null!;
        public DbSet<Transaction> Transactions { get; set; } = null!;
        public DbSet<CreditCycle> CreditCycles { get; set; } = null!;
        public DbSet<CreditCharge> CreditCharges { get; set; } = null!;
        public DbSet<CreditInstallmentPlan> CreditInstallmentPlans { get; set; } = null!;
        public DbSet<CreditInstallment> CreditInstallments { get; set; } = null!;
        public DbSet<CreditPayment> CreditPayments { get; set; } = null!;
        public DbSet<InstallmentAllocation> InstallmentAllocations { get; set; } = null!;
        public DbSet<BillableParty> BillableParties { get; set; } = null!;
        public DbSet<TransactionAllocation> TransactionAllocations { get; set; } = null!;
        public DbSet<BancoppelImportedRow> BancoppelImportedRows { get; set; } = null!;
        public DbSet<TelegramIdentity> TelegramIdentities { get; set; } = null!;
        public DbSet<TelegramDraft> TelegramDrafts { get; set; } = null!;
        public DbSet<TelegramProcessedUpdate> TelegramProcessedUpdates { get; set; } = null!;
        public DbSet<CatalogRule> CatalogRules { get; set; } = null!;
        public DbSet<Budget> Budgets { get; set; } = null!;
        public DbSet<BudgetThreshold> BudgetThresholds { get; set; } = null!;
        public DbSet<AlertDelivery> AlertDeliveries { get; set; } = null!;
        public DbSet<AlertOutbox> AlertOutbox { get; set; } = null!;
        public DbSet<InvestmentProduct> InvestmentProducts { get; set; } = null!;
        public DbSet<InvestmentOffer> InvestmentOffers { get; set; } = null!;
        public DbSet<InvestmentRateTier> InvestmentRateTiers { get; set; } = null!;
        public DbSet<InvestmentPlan> InvestmentPlans { get; set; } = null!;
        public DbSet<InvestmentPlanAllocation> InvestmentPlanAllocations { get; set; } = null!;
        public DbSet<RecurringItem> RecurringItems { get; set; } = null!;
        public DbSet<BudgetItem> BudgetItems { get; set; } = null!;
        public DbSet<BudgetItemAlertDelivery> BudgetItemAlertDeliveries { get; set; } = null!;

        public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            ApplyAuditInfo();
            return base.SaveChangesAsync(cancellationToken);
        }

        public override int SaveChanges()
        {
            ApplyAuditInfo();
            return base.SaveChanges();
        }

        private void ApplyAuditInfo()
        {
            var now = DateTime.UtcNow;
            var userName = _currentUser.GetName();

            foreach (var entry in ChangeTracker.Entries<BaseModel>())
            {
                if (entry.State == EntityState.Added)
                {
                    entry.Entity.Created = now;
                    entry.Entity.CreatedBy = userName;
                    continue;
                }

                if (entry.State == EntityState.Modified)
                {
                    entry.Property(nameof(BaseModel.Created)).IsModified = false;
                    entry.Property(nameof(BaseModel.CreatedBy)).IsModified = false;

                    entry.Entity.Updated = now;
                    entry.Entity.UpdatedBy = userName;
                }
            }
        }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            modelBuilder.Entity<User>(entity =>
            {
                entity.HasIndex(e => e.Email).IsUnique();
                entity.HasMany(e => e.Accounts).WithOne(e => e.User).HasForeignKey(e => e.UserId);
                entity.HasMany(e => e.Categories).WithOne(e => e.User).HasForeignKey(e => e.UserId);
                entity.HasMany(e => e.Subcategories).WithOne(e => e.User).HasForeignKey(e => e.UserId);
                entity.HasMany(e => e.Merchants).WithOne(e => e.User).HasForeignKey(e => e.UserId);
                entity.HasMany(e => e.Tags).WithOne(e => e.User).HasForeignKey(e => e.UserId);
                entity.HasMany(e => e.OwnedBillableParties).WithOne(e => e.OwnerUser).HasForeignKey(e => e.OwnerUserId);
                entity.HasMany(e => e.Sessions).WithOne(e => e.User).HasForeignKey(e => e.UserId);
            });

            modelBuilder.Entity<UserSession>(entity =>
            {
                entity.HasIndex(e => e.UserId);
                entity.HasIndex(e => e.RefreshTokenHash).IsUnique();
                entity.HasIndex(e => e.ExpiresAt);
            });

            modelBuilder.Entity<Account>(entity =>
            {
                entity.HasMany(e => e.Transactions).WithOne(e => e.Account).HasForeignKey(e => e.AccountId);
                entity.HasMany(e => e.CreditCharges).WithOne(e => e.Account).HasForeignKey(e => e.AccountId);
                entity.HasMany(e => e.CreditPayments).WithOne(e => e.Account).HasForeignKey(e => e.AccountId);
                entity.HasMany(e => e.CreditCycles).WithOne(e => e.Account).HasForeignKey(e => e.AccountId);
                entity.HasMany(e => e.CreditInstallmentPlans).WithOne(e => e.Account).HasForeignKey(e => e.AccountId);
            });

            modelBuilder.Entity<Category>(entity =>
            {
                entity.HasMany(e => e.Transactions).WithOne(e => e.Category).HasForeignKey(e => e.CategoryId);
                entity.HasMany(e => e.Subcategories).WithOne(e => e.Category).HasForeignKey(e => e.CategoryId);
                entity.HasIndex(e => new { e.UserId, e.Type, e.Name });
            });

            modelBuilder.Entity<Subcategory>(entity =>
            {
                entity.HasMany(e => e.Transactions).WithOne(e => e.Subcategory).HasForeignKey(e => e.SubcategoryId);
                entity.HasIndex(e => new { e.UserId, e.CategoryId, e.NormalizedName }).IsUnique();
            });

            modelBuilder.Entity<Merchant>(entity =>
            {
                entity.HasMany(e => e.Transactions).WithOne(e => e.Merchant).HasForeignKey(e => e.MerchantId);
                entity.HasIndex(e => new { e.UserId, e.NormalizedName }).IsUnique();
            });

            modelBuilder.Entity<Tag>(entity =>
            {
                entity.HasIndex(e => new { e.UserId, e.NormalizedName }).IsUnique();
            });

            modelBuilder.Entity<CategoryTag>(entity =>
            {
                entity.HasKey(e => new { e.CategoryId, e.TagId });
                entity.HasOne(e => e.Category)
                    .WithMany(e => e.CategoryTags)
                    .HasForeignKey(e => e.CategoryId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.Tag)
                    .WithMany(e => e.CategoryTags)
                    .HasForeignKey(e => e.TagId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<TransactionTag>(entity =>
            {
                entity.HasKey(e => new { e.TransactionId, e.TagId });
                entity.HasOne(e => e.Transaction)
                    .WithMany(e => e.TransactionTags)
                    .HasForeignKey(e => e.TransactionId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.Tag)
                    .WithMany(e => e.TransactionTags)
                    .HasForeignKey(e => e.TagId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<Transaction>(entity =>
            {
                entity.HasIndex(e => e.TransferGroupId);
                entity.HasIndex(e => e.TransactionDate);
                entity.HasIndex(e => new { e.AccountId, e.TransactionDate });
                entity.HasIndex(e => new { e.CategoryId, e.TransactionDate });
                entity.HasIndex(e => new { e.SubcategoryId, e.TransactionDate });
                entity.HasIndex(e => new { e.MerchantId, e.TransactionDate });
                entity.HasOne(e => e.OriginRecurringItem)
                    .WithMany()
                    .HasForeignKey(e => e.OriginRecurringItemId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            modelBuilder.Entity<BillableParty>(entity =>
            {
                entity.HasIndex(e => new { e.OwnerUserId, e.NormalizedName }).IsUnique();
                entity.HasIndex(e => new { e.OwnerUserId, e.Type, e.Active });
                entity.HasOne(e => e.LinkedUser)
                    .WithMany()
                    .HasForeignKey(e => e.LinkedUserId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            modelBuilder.Entity<TransactionAllocation>(entity =>
            {
                entity.HasIndex(e => e.TransactionId);
                entity.HasIndex(e => e.BillablePartyId);
                entity.HasIndex(e => new { e.TransactionId, e.BillablePartyId }).IsUnique();
                entity.HasOne(e => e.Transaction)
                    .WithMany(e => e.TransactionAllocations)
                    .HasForeignKey(e => e.TransactionId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.BillableParty)
                    .WithMany(e => e.TransactionAllocations)
                    .HasForeignKey(e => e.BillablePartyId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<BancoppelImportedRow>(entity =>
            {
                entity.HasIndex(e => new { e.AccountId, e.Fingerprint }).IsUnique();
                entity.HasOne(e => e.Account).WithMany().HasForeignKey(e => e.AccountId).OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.Transaction).WithMany().HasForeignKey(e => e.TransactionId).OnDelete(DeleteBehavior.SetNull);
            });

            modelBuilder.Entity<TelegramIdentity>(entity =>
            {
                entity.HasIndex(e => e.TelegramUserId).IsUnique();
                entity.HasIndex(e => new { e.UserId, e.Active });
                entity.HasOne(e => e.User).WithMany().HasForeignKey(e => e.UserId).OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<TelegramDraft>(entity =>
            {
                // UUID generado en C#: nunca por la base de datos.
                entity.Property(e => e.DraftId).ValueGeneratedNever();
                // Un solo borrador pendiente por chat (índice parcial).
                entity.HasIndex(e => e.ChatId).IsUnique().HasFilter("status = 'pending'");
                entity.HasIndex(e => e.ExpiresAt);
                entity.HasIndex(e => new { e.TelegramIdentityId, e.Status });
                entity.HasOne(e => e.TelegramIdentity).WithMany().HasForeignKey(e => e.TelegramIdentityId).OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.Transaction).WithMany().HasForeignKey(e => e.TransactionId).OnDelete(DeleteBehavior.SetNull);
            });

            modelBuilder.Entity<TelegramProcessedUpdate>(entity =>
            {
                // update_id viene de Telegram, jamás se genera por identidad.
                entity.Property(e => e.UpdateId).ValueGeneratedNever();
                entity.HasIndex(e => new { e.Status, e.ClaimedAt });
                entity.HasOne(e => e.TelegramIdentity).WithMany().HasForeignKey(e => e.TelegramIdentityId).OnDelete(DeleteBehavior.SetNull);
            });

            modelBuilder.Entity<CreditCycle>(entity =>
            {
                entity.HasIndex(e => new { e.AccountId, e.CutoffAt }).IsUnique();
                entity.HasIndex(e => new { e.AccountId, e.DueAt });
            });

            modelBuilder.Entity<CreditCharge>(entity =>
            {
                entity.HasIndex(e => e.SourceTransactionId).IsUnique();
                entity.HasIndex(e => new { e.AccountId, e.OccurredAt });
                entity.HasIndex(e => new { e.AccountId, e.Status });
                entity.HasOne(e => e.SourceTransaction)
                    .WithOne(e => e.CreditCharge)
                    .HasForeignKey<CreditCharge>(e => e.SourceTransactionId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.Cycle)
                    .WithMany(e => e.Charges)
                    .HasForeignKey(e => e.CycleId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            modelBuilder.Entity<CreditInstallmentPlan>(entity =>
            {
                entity.HasIndex(e => e.SourceChargeId).IsUnique();
                entity.HasIndex(e => new { e.AccountId, e.Status });
                entity.HasOne(e => e.SourceCharge)
                    .WithOne(e => e.InstallmentPlan)
                    .HasForeignKey<CreditInstallmentPlan>(e => e.SourceChargeId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.StartCycle)
                    .WithMany()
                    .HasForeignKey(e => e.StartCycleId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            modelBuilder.Entity<CreditInstallment>(entity =>
            {
                entity.HasIndex(e => new { e.PlanId, e.InstallmentNumber }).IsUnique();
                entity.HasIndex(e => new { e.DueCycleId, e.Status });
                entity.HasOne(e => e.Plan)
                    .WithMany(e => e.Installments)
                    .HasForeignKey(e => e.PlanId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.DueCycle)
                    .WithMany(e => e.Installments)
                    .HasForeignKey(e => e.DueCycleId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            modelBuilder.Entity<CreditPayment>(entity =>
            {
                entity.HasIndex(e => e.SourceTransactionId).IsUnique();
                entity.HasIndex(e => new { e.AccountId, e.PaidAt });
                entity.HasOne(e => e.SourceTransaction)
                    .WithOne(e => e.CreditPayment)
                    .HasForeignKey<CreditPayment>(e => e.SourceTransactionId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<InstallmentAllocation>(entity =>
            {
                entity.HasIndex(e => e.PaymentId);
                entity.HasIndex(e => e.InstallmentId);
                entity.HasOne(e => e.Payment)
                    .WithMany(e => e.Allocations)
                    .HasForeignKey(e => e.PaymentId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.Installment)
                    .WithMany(e => e.Allocations)
                    .HasForeignKey(e => e.InstallmentId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<CatalogRule>(entity =>
            {
                entity.HasIndex(e => new { e.UserId, e.Active, e.Priority });
                entity.HasOne(e => e.User)
                    .WithMany()
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.TargetCategory)
                    .WithMany()
                    .HasForeignKey(e => e.TargetCategoryId)
                    .OnDelete(DeleteBehavior.Restrict);
                entity.HasOne(e => e.TargetSubcategory)
                    .WithMany()
                    .HasForeignKey(e => e.TargetSubcategoryId)
                    .OnDelete(DeleteBehavior.Restrict);
                // El XOR de targets lo garantiza la BD: ck_catalog_rules_target_xor.
            });

            modelBuilder.Entity<Budget>(entity =>
            {
                entity.HasOne(e => e.User)
                    .WithMany()
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.Category)
                    .WithMany()
                    .HasForeignKey(e => e.CategoryId)
                    .OnDelete(DeleteBehavior.Restrict);
                entity.HasOne(e => e.Subcategory)
                    .WithMany()
                    .HasForeignKey(e => e.SubcategoryId)
                    .OnDelete(DeleteBehavior.Restrict);
                // XOR de scope y unicidad (user_id, period_key, scope) son solo SQL
                // (ck_budgets_scope y ux_budgets_user_period_scope: índice de expresión).
            });

            modelBuilder.Entity<BudgetThreshold>(entity =>
            {
                entity.HasIndex(e => new { e.BudgetId, e.Percent }).IsUnique();
                entity.HasOne(e => e.Budget)
                    .WithMany(e => e.Thresholds)
                    .HasForeignKey(e => e.BudgetId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<AlertDelivery>(entity =>
            {
                // Candado de idempotencia del evaluador.
                entity.HasIndex(e => new { e.BudgetId, e.ThresholdId, e.PeriodKey }).IsUnique();
                entity.HasIndex(e => new { e.UserId, e.PeriodKey });
                // RESTRICT: preserva el historial de entregas ya notificadas.
                entity.HasOne(e => e.Budget)
                    .WithMany()
                    .HasForeignKey(e => e.BudgetId)
                    .OnDelete(DeleteBehavior.Restrict);
                // RESTRICT: preserva el historial de umbrales ya notificados.
                entity.HasOne(e => e.Threshold)
                    .WithMany(e => e.Deliveries)
                    .HasForeignKey(e => e.ThresholdId)
                    .OnDelete(DeleteBehavior.Restrict);
                entity.HasOne(e => e.User)
                    .WithMany()
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<AlertOutbox>(entity =>
            {
                // Idempotencia del camino de presupuesto (Fase 2), endurecida: excluye failed para
                // que una fila expirada libere la clave. El candado real sigue siendo alert_deliveries.
                entity.HasIndex(e => e.DeliveryId).IsUnique().HasFilter("delivery_id IS NOT NULL AND status <> 'failed'");
                entity.HasIndex(e => new { e.Status, e.NextAttemptAt });
                // Alcance de lectura por usuario. El outbox tiene dueño propio: el filtro es una
                // igualdad y no depende de la entrega, que es nula fuera del camino de presupuesto.
                entity.HasIndex(e => new { e.UserId, e.Status });
                // Idempotencia del camino nuevo: una fila por fuente, ocurrencia y clave
                // (source_key = period_key o {period_key}:{alert_kind}).
                entity.HasIndex(e => new { e.SourceType, e.SourceId, e.SourceKey })
                    .IsUnique()
                    .HasFilter("source_id IS NOT NULL AND status <> 'failed'");
                // Sin IsRequired: la columna es nullable y la FK física se retiró en Fase 3.
                // ClientSetNull: al borrar la entrega se anula el FK, sin cascada en la base.
                entity.HasOne(e => e.Delivery)
                    .WithOne(e => e.Outbox)
                    .HasForeignKey<AlertOutbox>(e => e.DeliveryId)
                    .OnDelete(DeleteBehavior.ClientSetNull);
                entity.HasOne(e => e.User)
                    .WithMany()
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<RecurringItem>(entity =>
            {
                // Una sola plantilla por (usuario, tipo, nombre).
                entity.HasIndex(e => new { e.UserId, e.Kind, e.Name }).IsUnique();
                entity.HasOne(e => e.User)
                    .WithMany()
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.Category)
                    .WithMany()
                    .HasForeignKey(e => e.CategoryId)
                    .OnDelete(DeleteBehavior.Restrict);
                entity.HasOne(e => e.Subcategory)
                    .WithMany()
                    .HasForeignKey(e => e.SubcategoryId)
                    .OnDelete(DeleteBehavior.Restrict);
                entity.HasOne(e => e.Account)
                    .WithMany()
                    .HasForeignKey(e => e.AccountId)
                    .OnDelete(DeleteBehavior.Restrict);
                entity.HasOne(e => e.Merchant)
                    .WithMany()
                    .HasForeignKey(e => e.MerchantId)
                    .OnDelete(DeleteBehavior.Restrict);
                // XOR de scope, ventana ends_period >= starts_period y coherencia de monto fijo
                // son solo SQL (ck_recurring_items_*).
            });

            modelBuilder.Entity<BudgetItem>(entity =>
            {
                // Remontar un mes no duplica la misma partida.
                entity.HasIndex(e => new { e.UserId, e.PeriodKey, e.Kind, e.Name }).IsUnique();
                // Una transacción satisface como máximo UNA partida.
                entity.HasIndex(e => e.TransactionId).IsUnique().HasFilter("transaction_id IS NOT NULL");
                entity.HasIndex(e => new { e.UserId, e.PeriodKey, e.Status });
                entity.HasIndex(e => new { e.UserId, e.Status, e.PlannedDate });
                entity.HasOne(e => e.User)
                    .WithMany()
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.Category)
                    .WithMany()
                    .HasForeignKey(e => e.CategoryId)
                    .OnDelete(DeleteBehavior.Restrict);
                entity.HasOne(e => e.Subcategory)
                    .WithMany()
                    .HasForeignKey(e => e.SubcategoryId)
                    .OnDelete(DeleteBehavior.Restrict);
                entity.HasOne(e => e.Account)
                    .WithMany()
                    .HasForeignKey(e => e.AccountId)
                    .OnDelete(DeleteBehavior.Restrict);
                entity.HasOne(e => e.Merchant)
                    .WithMany()
                    .HasForeignKey(e => e.MerchantId)
                    .OnDelete(DeleteBehavior.Restrict);
                entity.HasOne(e => e.RecurringItem)
                    .WithMany(e => e.BudgetItems)
                    .HasForeignKey(e => e.RecurringItemId)
                    .OnDelete(DeleteBehavior.SetNull);
                entity.HasOne(e => e.Transaction)
                    .WithMany()
                    .HasForeignKey(e => e.TransactionId)
                    .OnDelete(DeleteBehavior.SetNull);
                // El XOR de scope, la coherencia executed/transaction_id y el formato del
                // periodo son solo SQL (ck_budget_items_*).
            });

            modelBuilder.Entity<BudgetItemAlertDelivery>(entity =>
            {
                // Candado de idempotencia: una alerta por partida, tipo y periodo.
                entity.HasIndex(e => new { e.ItemId, e.AlertKind, e.PeriodKey }).IsUnique();
                entity.HasOne(e => e.Item)
                    .WithMany(e => e.AlertDeliveries)
                    .HasForeignKey(e => e.ItemId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.User)
                    .WithMany()
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            // Catalog CHECK constraints (institution codes, inferred validity) live in SQL only,
            // following this solution's existing convention: there are no EF migrations, and
            // SQL/schema.sql plus SQL/migrations/*.sql are the source of truth for DDL.
            modelBuilder.Entity<InvestmentProduct>(entity =>
            {
                entity.HasIndex(e => new { e.UserId, e.AccountId });
                entity.HasIndex(e => new { e.UserId, e.Active });
                entity.HasOne(e => e.Account).WithMany().HasForeignKey(e => e.AccountId).OnDelete(DeleteBehavior.Restrict);
                entity.HasMany(e => e.Offers).WithOne(e => e.Product).HasForeignKey(e => e.InvestmentProductId).OnDelete(DeleteBehavior.Cascade);
            });

            // ValidTo >= ValidFrom is enforced by ck_investment_offers_validity in SQL; see the note above.
            modelBuilder.Entity<InvestmentOffer>(entity =>
            {
                entity.HasIndex(e => new { e.InvestmentProductId, e.CapturedForMonth }).IsUnique();
                entity.HasMany(e => e.Tiers).WithOne(e => e.Offer).HasForeignKey(e => e.InvestmentOfferId).OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<InvestmentRateTier>(entity =>
            {
                entity.HasIndex(e => new { e.InvestmentOfferId, e.MinimumAmount }).IsUnique();
            });

            modelBuilder.Entity<InvestmentPlan>(entity =>
            {
                entity.HasIndex(e => new { e.UserId, e.PlanMonth }).IsUnique();
                entity.HasMany(e => e.Allocations).WithOne(e => e.Plan).HasForeignKey(e => e.InvestmentPlanId).OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<InvestmentPlanAllocation>(entity =>
            {
                entity.HasIndex(e => new { e.InvestmentPlanId, e.InvestmentProductId }).IsUnique();
                entity.HasOne<InvestmentProduct>().WithMany().HasForeignKey(e => e.InvestmentProductId).OnDelete(DeleteBehavior.Restrict);
                entity.HasOne<Account>().WithMany().HasForeignKey(e => e.AccountId).OnDelete(DeleteBehavior.Restrict);
            });
        }
    }
}
