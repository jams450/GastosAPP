using GastosApp.BusinessLogic.Models.DataBase;

namespace GastosApp.BusinessLogic.Interfaces
{
    public interface ICategoryService
    {
        Task<Category?> GetByIdAsync(int id);
        Task<IEnumerable<Category>> GetAllByUserIdAsync(int userId);
        Task<IEnumerable<Category>> GetAllActiveByUserIdAsync(int userId);
        Task<IEnumerable<Category>> GetByTypeAsync(int userId, string type);
        Task<Category> CreateAsync(Category category);
        Task<Category?> UpdateAsync(int id, Category category);
        Task<bool> DeleteAsync(int id);
        Task<bool> UpdateActiveStatusAsync(int id, bool active);
        Task<Category?> GetByIdWithTagsAsync(int id, int userId);
        Task<Category> CreateWithTagsAsync(Category category, int userId, IEnumerable<string>? tags);
        Task<Category?> UpdateWithTagsAsync(int id, Category category, int userId, IEnumerable<string>? tags);
    }
}
