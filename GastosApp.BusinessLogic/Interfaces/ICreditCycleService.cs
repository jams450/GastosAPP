using GastosApp.Models.Entities;

namespace GastosApp.BusinessLogic.Interfaces
{
    public interface ICreditCycleService
    {
        Task<CreditCycle> ResolveChargeCycleAsync(Account account, DateTime purchaseDate);
        Task<IReadOnlyList<CreditCycle>> ResolveDueCyclesAsync(Account account, DateTime purchaseDate, int installmentCount);
    }
}
