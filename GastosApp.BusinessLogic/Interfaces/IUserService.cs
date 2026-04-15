using GastosApp.BusinessLogic.Models.DataBase;

namespace GastosApp.BusinessLogic.Interfaces
{
    public interface IUserService
    {
        Task<User?> GetByIdAsync(int id);
        Task<User?> GetByEmailAsync(string email);
        Task<IEnumerable<User>> GetAllAsync();
        Task<User> CreateAsync(User user);
        Task<User?> UpdateAsync(int id, User user);
        Task<bool> DeleteAsync(int id);
        Task<bool> UpdateActiveStatusAsync(int id, bool active);
        Task<User?> ValidateCredentialsAsync(string email, string password);
    }
}
