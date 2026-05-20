using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;
using IPasswordService = GastosApp.BusinessLogic.Interfaces.IPasswordService;
using Microsoft.EntityFrameworkCore;
using System.Net.Mail;

namespace GastosApp.BusinessLogic.Services
{
    public class UserService : IUserService
    {
        private const int MinPasswordLength = 8;
        private const int MaxNameLength = 100;
        private const int MaxEmailLength = 100;
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
            var normalizedEmail = NormalizeEmailOrThrow(email);
            return await _repository.Get<User>(u => u.Email == normalizedEmail).FirstOrDefaultAsync();
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
            user.Name = NormalizeNameOrThrow(user.Name);
            user.Email = NormalizeEmailOrThrow(user.Email);
            ValidatePasswordOrThrow(user.Password);

            if (await EmailExistsAsync(user.Email))
            {
                throw new ArgumentException("A user with same email already exists");
            }

            user.Password = _passwordService.HashPassword(user.Password);
            user.Active = true;

            try
            {
                var createdUser = await _repository.Save<User>(user);
                await _billablePartyService.EnsureSelfPartyAsync(createdUser.UserId, createdUser.Name);
                return createdUser;
            }
            catch (DbUpdateException ex)
            {
                throw new ArgumentException("A user with same email already exists", ex);
            }
        }

        public async Task<User?> UpdateAsync(int id, User user)
        {
            var existing = await _repository.GetTrack<User>()
                .FirstOrDefaultAsync(u => u.UserId == id);

            if (existing == null) return null;

            var normalizedName = NormalizeNameOrThrow(user.Name);
            var normalizedEmail = NormalizeEmailOrThrow(user.Email);

            if (await EmailExistsAsync(normalizedEmail, id))
            {
                throw new ArgumentException("A user with same email already exists");
            }

            existing.Name = normalizedName;
            existing.Email = normalizedEmail;

            if (existing.Active != user.Active)
            {
                existing.Active = user.Active;
                existing.SessionVersion += 1;
            }

            existing.Admin = user.Admin;

            if (!string.IsNullOrEmpty(user.Password) && user.Password != existing.Password)
            {
                ValidatePasswordOrThrow(user.Password);

                if (_passwordService.VerifyPassword(user.Password, existing.Password))
                {
                    throw new ArgumentException("New password must be different from current password");
                }

                existing.Password = _passwordService.HashPassword(user.Password);
                existing.SessionVersion += 1;
            }

            try
            {
                await _repository.SaveChangesAsync();
                return existing;
            }
            catch (DbUpdateException ex)
            {
                throw new ArgumentException("A user with same email already exists", ex);
            }
        }

        public async Task<bool> ChangePasswordAsync(int id, string newPassword)
        {
            if (string.IsNullOrWhiteSpace(newPassword))
            {
                throw new ArgumentException("New password is required", nameof(newPassword));
            }

            ValidatePasswordOrThrow(newPassword);

            var existing = await _repository.GetTrack<User>().FirstOrDefaultAsync(u => u.UserId == id);
            if (existing == null)
            {
                return false;
            }

            if (_passwordService.VerifyPassword(newPassword, existing.Password))
            {
                throw new ArgumentException("New password must be different from current password", nameof(newPassword));
            }

            existing.Password = _passwordService.HashPassword(newPassword);
            existing.SessionVersion += 1;
            await _repository.SaveChangesAsync();
            return true;
        }

        public async Task<bool> DeleteAsync(int id)
        {
            var existing = await _repository.GetTrack<User>().FirstOrDefaultAsync(u => u.UserId == id);
            if (existing == null)
            {
                return false;
            }

            if (existing.Active)
            {
                existing.Active = false;
                existing.SessionVersion += 1;
                await _repository.SaveChangesAsync();
            }

            return true;
        }

        public async Task<bool> UpdateActiveStatusAsync(int id, bool active)
        {
            var existing = await _repository.GetTrack<User>().FirstOrDefaultAsync(u => u.UserId == id);
            if (existing == null)
            {
                return false;
            }

            if (existing.Active != active)
            {
                existing.Active = active;
                existing.SessionVersion += 1;
                await _repository.SaveChangesAsync();
            }

            return true;
        }

        public async Task<bool> UpdateAdminStatusAsync(int id, bool isAdmin)
        {
            var existing = await _repository.GetTrack<User>().FirstOrDefaultAsync(u => u.UserId == id);
            if (existing == null)
            {
                return false;
            }

            if (existing.Admin != isAdmin)
            {
                existing.Admin = isAdmin;
                await _repository.SaveChangesAsync();
            }

            return true;
        }

        public async Task<User?> ValidateCredentialsAsync(string email, string password)
        {
            if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
            {
                return null;
            }

            var normalizedEmail = email.Trim().ToLowerInvariant();
            var user = await _repository.Get<User>(u => u.Email == normalizedEmail).FirstOrDefaultAsync();
            if (user == null || !user.Active)
                return null;

            if (!_passwordService.VerifyPassword(password, user.Password))
                return null;

            return user;
        }

        private static string NormalizeNameOrThrow(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                throw new ArgumentException("User name is required");
            }

            var cleaned = value.Trim();
            if (cleaned.Length > MaxNameLength)
            {
                throw new ArgumentException($"User name cannot exceed {MaxNameLength} characters");
            }

            return cleaned;
        }

        private static string NormalizeEmailOrThrow(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                throw new ArgumentException("Email is required");
            }

            var cleaned = value.Trim().ToLowerInvariant();
            if (cleaned.Length > MaxEmailLength)
            {
                throw new ArgumentException($"Email cannot exceed {MaxEmailLength} characters");
            }

            try
            {
                _ = new MailAddress(cleaned);
            }
            catch (FormatException)
            {
                throw new ArgumentException("Invalid email format");
            }

            return cleaned;
        }

        private static void ValidatePasswordOrThrow(string? password)
        {
            if (string.IsNullOrWhiteSpace(password))
            {
                throw new ArgumentException("Password is required");
            }

            if (password.Length < MinPasswordLength)
            {
                throw new ArgumentException($"Password must have at least {MinPasswordLength} characters");
            }
        }

        private async Task<bool> EmailExistsAsync(string normalizedEmail, int? excludeUserId = null)
        {
            return await _repository.Get<User>(u =>
                u.Email == normalizedEmail &&
                (!excludeUserId.HasValue || u.UserId != excludeUserId.Value))
                .AnyAsync();
        }
    }
}
