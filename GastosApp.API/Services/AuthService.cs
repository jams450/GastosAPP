using GastosApp.API.Interfaces;
using GastosApp.API.Models.Auth;
using GastosApp.API.Security;
using GastosApp.BusinessLogic.Context;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using System.Text;

namespace GastosApp.API.Services;

public class AuthService : IAuthService
{
    private readonly IConfiguration _configuration;
    private readonly IJwtService _jwtService;
    private readonly IUserService _userService;
    private readonly ContextSqlGastos _context;
    private readonly int _maxFailedAttempts;
    private readonly int _lockMinutes;
    private readonly int _refreshDays;
    private readonly bool _allowConfiguredAdminLogin;

    public AuthService(
        IConfiguration configuration,
        IJwtService jwtService,
        IUserService userService,
        ContextSqlGastos context,
        IWebHostEnvironment environment)
    {
        _configuration = configuration;
        _jwtService = jwtService;
        _userService = userService;
        _context = context;
        _maxFailedAttempts = Math.Max(1, _configuration.GetValue<int>("Auth:MaxFailedAttempts", 5));
        _lockMinutes = Math.Max(1, _configuration.GetValue<int>("Auth:LockMinutes", 15));
        _refreshDays = Math.Max(1, _configuration.GetValue<int>("Auth:RefreshDays", 30));
        _allowConfiguredAdminLogin = _configuration.GetValue<bool>("Auth:EnableConfiguredAdminLogin", false)
            && environment.IsDevelopment();
    }

    public async Task<LoginResponse?> AuthenticateAsync(LoginRequest request)
    {
        var adminUser = TryAuthenticateConfiguredAdmin(request);
        if (adminUser != null)
        {
            return BuildAdminLoginResponse(adminUser);
        }

        var user = await AuthenticateRegularUserAsync(request);
        if (user == null)
        {
            return null;
        }

        return await BuildUserLoginResponseAsync(user);
    }

    public async Task<LoginResponse?> RefreshAsync(string refreshToken)
    {
        if (string.IsNullOrWhiteSpace(refreshToken))
        {
            return null;
        }

        var session = await GetValidRefreshSessionAsync(refreshToken);
        if (session == null)
        {
            return null;
        }

        var user = session.User;
        if (!IsUserEligibleForRefresh(user))
        {
            return null;
        }

        var newRefreshToken = GenerateRefreshToken();
        var newRefreshExpiration = DateTime.UtcNow.AddDays(_refreshDays);
        var newSession = BuildNewSession(user.UserId, newRefreshToken, newRefreshExpiration);

        await RotateRefreshTokenAtomicAsync(session, newSession);

        var accessToken = _jwtService.GenerateToken(user.UserId, user.Email, user.Admin, user.SessionVersion, newSession.SessionId);
        var accessExpiration = _jwtService.GetTokenExpiration();

        return new LoginResponse(accessToken, accessExpiration, user.Email, newRefreshToken, newRefreshExpiration);
    }

    public async Task<bool> RevokeRefreshTokenAsync(string refreshToken)
    {
        if (string.IsNullOrWhiteSpace(refreshToken))
        {
            return false;
        }

        var hash = HashToken(refreshToken);
        var session = await _context.UserSessions.FirstOrDefaultAsync(s => s.RefreshTokenHash == hash);
        if (session == null || session.RevokedAt.HasValue)
        {
            return false;
        }

        session.RevokedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        return true;
    }

    private User? TryAuthenticateConfiguredAdmin(LoginRequest request)
    {
        if (!_allowConfiguredAdminLogin)
        {
            return null;
        }

        if (!request.Username.Equals("admin", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var adminUsername = _configuration["Auth:Username"];
        var adminPassword = _configuration["Auth:Password"];

        if (string.IsNullOrWhiteSpace(adminUsername)
            || string.IsNullOrWhiteSpace(adminPassword)
            || request.Username != adminUsername
            || request.Password != adminPassword)
        {
            return null;
        }

        return new User
        {
            UserId = 0,
            Name = "Administrator",
            Email = adminUsername,
            Admin = true,
            Active = true
        };
    }

    private async Task<User?> AuthenticateRegularUserAsync(LoginRequest request)
    {
        var existing = await _context.Users.FirstOrDefaultAsync(u => u.Email == request.Username);
        if (existing != null && existing.LockedUntil.HasValue && existing.LockedUntil.Value > DateTime.UtcNow)
        {
            return null;
        }

        var user = await _userService.ValidateCredentialsAsync(request.Username, request.Password);
        if (user == null)
        {
            await RegisterFailedLoginAttemptAsync(existing);
            return null;
        }

        await ClearLockStateIfNeededAsync(user);
        return user;
    }

    private async Task<LoginResponse> BuildUserLoginResponseAsync(User user)
    {
        var refreshToken = GenerateRefreshToken();
        var refreshExpiration = DateTime.UtcNow.AddDays(_refreshDays);

        var session = BuildNewSession(user.UserId, refreshToken, refreshExpiration);
        _context.UserSessions.Add(session);
        await _context.SaveChangesAsync();

        var token = _jwtService.GenerateToken(user.UserId, user.Email, user.Admin, user.SessionVersion, session.SessionId);
        var expiration = _jwtService.GetTokenExpiration();

        return new LoginResponse(token, expiration, user.Email, refreshToken, refreshExpiration);
    }

    private LoginResponse BuildAdminLoginResponse(User adminUser)
    {
        var adminToken = _jwtService.GenerateToken(adminUser.UserId, adminUser.Email, adminUser.Admin, adminUser.SessionVersion);
        var adminExpiration = _jwtService.GetTokenExpiration();
        return new LoginResponse(adminToken, adminExpiration, adminUser.Email, null, null);
    }

    private UserSession BuildNewSession(int userId, string refreshToken, DateTime expiresAt)
    {
        return new UserSession
        {
            UserId = userId,
            RefreshTokenHash = HashToken(refreshToken),
            ExpiresAt = expiresAt,
            Created = DateTime.UtcNow,
            ReplacedBySessionId = null
        };
    }

    private async Task RegisterFailedLoginAttemptAsync(User? existing)
    {
        if (existing == null)
        {
            return;
        }

        existing.FailedLoginCount += 1;
        if (existing.FailedLoginCount >= _maxFailedAttempts)
        {
            existing.LockedUntil = DateTime.UtcNow.AddMinutes(_lockMinutes);
            existing.FailedLoginCount = 0;
        }

        await _context.SaveChangesAsync();
    }

    private async Task ClearLockStateIfNeededAsync(User user)
    {
        if (user.FailedLoginCount == 0 && user.LockedUntil == null)
        {
            return;
        }

        user.FailedLoginCount = 0;
        user.LockedUntil = null;
        await _context.SaveChangesAsync();
    }

    private async Task<UserSession?> GetValidRefreshSessionAsync(string refreshToken)
    {
        var hash = HashToken(refreshToken);
        var session = await _context.UserSessions
            .Include(s => s.User)
            .FirstOrDefaultAsync(s => s.RefreshTokenHash == hash);

        if (session == null || session.RevokedAt.HasValue || session.ExpiresAt <= DateTime.UtcNow)
        {
            return null;
        }

        return session;
    }

    private static bool IsUserEligibleForRefresh(User user)
    {
        return user.Active && (!user.LockedUntil.HasValue || user.LockedUntil.Value <= DateTime.UtcNow);
    }

    private async Task RotateRefreshTokenAtomicAsync(UserSession currentSession, UserSession newSession)
    {
        await using var transaction = await _context.Database.BeginTransactionAsync();

        currentSession.RevokedAt = DateTime.UtcNow;
        _context.UserSessions.Add(newSession);
        await _context.SaveChangesAsync();

        currentSession.ReplacedBySessionId = newSession.SessionId;
        await _context.SaveChangesAsync();

        await transaction.CommitAsync();
    }

    private static string GenerateRefreshToken()
    {
        var bytes = RandomNumberGenerator.GetBytes(64);
        return Convert.ToBase64String(bytes);
    }

    private static string HashToken(string token)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(token));
        return Convert.ToHexString(bytes);
    }
}
