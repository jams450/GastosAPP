using GastosApp.BusinessLogic.Models.DataBase;

namespace GastosApp.BusinessLogic.Interfaces
{
    public interface IMerchantService
    {
        Task<Merchant?> GetByIdAsync(int id, int userId);
        Task<IEnumerable<Merchant>> GetByUserIdAsync(int userId, bool onlyActive = false);
        Task<Merchant> CreateAsync(Merchant merchant, int userId);
        Task<Merchant?> UpdateAsync(int id, Merchant merchant, int userId);
        Task<bool> UpdateActiveStatusAsync(int id, int userId, bool active);
    }
}
