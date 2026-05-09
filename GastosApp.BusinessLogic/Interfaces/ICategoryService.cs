using GastosApp.Models.Entities;

namespace GastosApp.BusinessLogic.Interfaces
{
    public interface ICategoryService
    {
        Task<Category?> GetByIdAsync(int id);
        Task<IEnumerable<Category>> GetAllByUserIdAsync(int userId);
        Task<IEnumerable<Category>> GetAllActiveByUserIdAsync(int userId);
        Task<IEnumerable<Category>> GetByTypeAsync(int userId, string type);
        Task<bool> UpdateActiveStatusAsync(int id, bool active);
        Task<Category?> GetByIdWithTagsAsync(int id, int userId);
        Task<Category> CreateWithTagsAsync(Category category, int userId, IEnumerable<string>? tags);
        Task<Category?> UpdateWithTagsAsync(int id, Category category, int userId, IEnumerable<string>? tags);
    }
}
