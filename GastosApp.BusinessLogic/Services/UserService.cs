using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.DataBase;
using GastosApp.Models.Interfaces;
using IPasswordService = GastosApp.BusinessLogic.Interfaces.IPasswordService;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.BusinessLogic.Services
{
    public class UserService : IUserService
    {
        private readonly IRepository _repository;
        private readonly IPasswordService _passwordService;

        public UserService(IRepository repository, IPasswordService passwordService)
        {
            _repository = repository;
            _passwordService = passwordService;
        }

        public async Task<User?> GetByIdAsync(int id)
        {
            return await _repository.GetByIdAsync<User>(id);
        }

        public async Task<User?> GetByEmailAsync(string email)
        {
            return await _repository.Get<User>(u => u.Email == email).FirstOrDefaultAsync();
        }

        public async Task<IEnumerable<User>> GetAllAsync()
        {
            return await _repository.Get<User>().ToListAsync();
        }

        public async Task<User> CreateAsync(User user)
        {
            // Encriptar password antes de guardar
            user.Password = _passwordService.HashPassword(user.Password);
            user.Active = true;
            user.Created = DateTime.UtcNow;
            return await _repository.Save<User>(user);
        }

        public async Task<User?> UpdateAsync(int id, User user)
        {
            var existing = await _repository.GetByIdAsync<User>(id);
            if (existing == null) return null;

            // Si se proporciona un nuevo password, encriptarlo
            if (!string.IsNullOrEmpty(user.Password) && user.Password != existing.Password)
            {
                user.Password = _passwordService.HashPassword(user.Password);
            }
            else
            {
                // Mantener el password existente si no se proporciona uno nuevo
                user.Password = existing.Password;
            }

            user.UserId = id;
            user.Updated = DateTime.UtcNow;
            return await _repository.SaveUpdate<User>(id, user);
        }

        public async Task<bool> DeleteAsync(int id)
        {
            var result = await _repository.DeleteModel<User>(id);
            return result > 0;
        }

        public async Task<bool> UpdateActiveStatusAsync(int id, bool active)
        {
            return await _repository.UpdateFieldAsync<User>(id, "Active", active);
        }

        public async Task<User?> ValidateCredentialsAsync(string email, string password)
        {
            var user = await GetByEmailAsync(email);
            if (user == null || !user.Active)
                return null;

            if (!_passwordService.VerifyPassword(password, user.Password))
                return null;

            return user;
        }
    }
}
