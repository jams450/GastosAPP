using GastosApp.BusinessLogic.Models.DataBase;

namespace GastosApp.BusinessLogic.Interfaces
{
    public interface ISubcategoryService
    {
        Task<Subcategory?> GetByIdAsync(int id, int userId);
        Task<IEnumerable<Subcategory>> GetByUserIdAsync(int userId, bool onlyActive = false);
        Task<IEnumerable<Subcategory>> GetByCategoryIdAsync(int userId, int categoryId, bool onlyActive = false);
        Task<Subcategory> CreateAsync(Subcategory subcategory, int userId);
        Task<Subcategory?> UpdateAsync(int id, Subcategory subcategory, int userId);
        Task<bool> UpdateActiveStatusAsync(int id, int userId, bool active);
    }
}
