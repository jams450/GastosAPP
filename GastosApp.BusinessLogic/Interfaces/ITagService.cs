using GastosApp.BusinessLogic.Models.DataBase;

namespace GastosApp.BusinessLogic.Interfaces
{
    public interface ITagService
    {
        Task<Tag?> GetByIdAsync(int id, int userId);
        Task<IEnumerable<Tag>> GetByUserIdAsync(int userId, bool onlyActive = false);
        Task<IEnumerable<Tag>> SearchAsync(int userId, string query, int take = 20);
        Task<Tag> CreateAsync(Tag tag, int userId);
        Task<Tag?> UpdateAsync(int id, Tag tag, int userId);
        Task<bool> UpdateActiveStatusAsync(int id, int userId, bool active);
        Task<IReadOnlyCollection<Tag>> ResolveOrCreateAsync(int userId, IEnumerable<string>? tagNames);
    }
}
