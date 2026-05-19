using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;
using IPasswordService = GastosApp.BusinessLogic.Interfaces.IPasswordService;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.BusinessLogic.Services
{
    public class UserService : IUserService
    {
        private readonly IRepository _repository;
        private readonly IPasswordService _passwordService;
        private readonly IBillablePartyService _billablePartyService;

        public UserService(
            IRepository repository,
            IPasswordService passwordService,
            IBillablePartyService billablePartyService)
        {
            _repository = repository;
            _passwordService = passwordService;
            _billablePartyService = billablePartyService;
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
            return await _repository.Get<User>()
                .OrderBy(u => u.Name)
                .ThenBy(u => u.UserId)
                .ToListAsync();
        }

        public async Task<User> CreateAsync(User user)
        {
            // Hash password antes de guardar
            user.Password = _passwordService.HashPassword(user.Password);
            user.Active = true;

            var createdUser = await _repository.Save<User>(user);
            await _billablePartyService.EnsureSelfPartyAsync(createdUser.UserId, createdUser.Name);

            return createdUser;
        }

        public async Task<User?> UpdateAsync(int id, User user)
        {
            var existing = await _repository.GetTrack<User>()
                .FirstOrDefaultAsync(u => u.UserId == id);

            if (existing == null) return null;

            existing.Name = user.Name;
            existing.Email = user.Email;
            existing.Active = user.Active;
            existing.Admin = user.Admin;

            // Si se proporciona un nuevo password, hashearlo
            if (!string.IsNullOrEmpty(user.Password) && user.Password != existing.Password)
            {
                existing.Password = _passwordService.HashPassword(user.Password);
                existing.SessionVersion += 1;
            }

            await _repository.SaveChangesAsync();
            return existing;
        }

        public async Task<bool> ChangePasswordAsync(int id, string newPassword)
        {
            if (string.IsNullOrWhiteSpace(newPassword))
            {
                throw new ArgumentException("New password is required", nameof(newPassword));
            }

            var existing = await _repository.GetByIdAsync<User>(id);
            if (existing == null)
            {
                return false;
            }

            existing.Password = _passwordService.HashPassword(newPassword);
            existing.SessionVersion += 1;
            await _repository.SaveChangesAsync();
            return true;
        }

        public async Task<bool> DeleteAsync(int id)
        {
            var result = await _repository.RemoveAsync<User>(id);
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
