using GastosApp.API.Models.Auth;
using GastosApp.API.Interfaces;
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

    public AuthService(
        IConfiguration configuration, 
        IJwtService jwtService, 
        IUserService userService,
        ContextSqlGastos context)
    {
        _configuration = configuration;
        _jwtService = jwtService;
        _userService = userService;
        _context = context;
        _maxFailedAttempts = Math.Max(1, _configuration.GetValue<int>("Auth:MaxFailedAttempts", 5));
        _lockMinutes = Math.Max(1, _configuration.GetValue<int>("Auth:LockMinutes", 15));
        _refreshDays = Math.Max(1, _configuration.GetValue<int>("Auth:RefreshDays", 30));
    }

    public async Task<LoginResponse?> AuthenticateAsync(LoginRequest request)
    {
        User? user = null;

        // Si es usuario admin, validar solo contra configuración explícita
        if (request.Username.Equals("admin", StringComparison.OrdinalIgnoreCase))
        {
            var adminUsername = _configuration["Auth:Username"];
            var adminPassword = _configuration["Auth:Password"];

            if (!string.IsNullOrWhiteSpace(adminUsername)
                && !string.IsNullOrWhiteSpace(adminPassword)
                && request.Username == adminUsername
                && request.Password == adminPassword)
            {
                user = new User
                {
                    UserId = 0,
                    Name = "Administrator",
                    Email = adminUsername,
                    Admin = true,
                    Active = true
                };
            }
        }
        else
        {
            var existing = await _context.Users.FirstOrDefaultAsync(u => u.Email == request.Username);
            if (existing != null && existing.LockedUntil.HasValue && existing.LockedUntil.Value > DateTime.UtcNow)
            {
                return null;
            }

            user = await _userService.ValidateCredentialsAsync(request.Username, request.Password);

            if (user == null)
            {
                if (existing != null)
                {
                    existing.FailedLoginCount += 1;
                    if (existing.FailedLoginCount >= _maxFailedAttempts)
                    {
                        existing.LockedUntil = DateTime.UtcNow.AddMinutes(_lockMinutes);
                        existing.FailedLoginCount = 0;
                    }

                    await _context.SaveChangesAsync();
                }

                return null;
            }

            if (user.FailedLoginCount != 0 || user.LockedUntil != null)
            {
                user.FailedLoginCount = 0;
                user.LockedUntil = null;
                await _context.SaveChangesAsync();
            }
        }

        if (user == null)
        {
            return null;
        }

        if (user.UserId == 0)
        {
            var adminToken = _jwtService.GenerateToken(user.UserId, user.Email, user.Admin);
            var adminExpiration = _jwtService.GetTokenExpiration();
            return new LoginResponse(adminToken, adminExpiration, user.Email, null, null);
        }

        var refreshToken = GenerateRefreshToken();
        var refreshExpiration = DateTime.UtcNow.AddDays(_refreshDays);

        var session = new UserSession
        {
            UserId = user.UserId,
            RefreshTokenHash = HashToken(refreshToken),
            ExpiresAt = refreshExpiration,
            Created = DateTime.UtcNow
        };

        _context.UserSessions.Add(session);
        await _context.SaveChangesAsync();

        var token = _jwtService.GenerateToken(user.UserId, user.Email, user.Admin, user.SessionVersion, session.SessionId);
        var expiration = _jwtService.GetTokenExpiration();

        var response = new LoginResponse(
            token,
            expiration,
            user.Email,
            refreshToken,
            refreshExpiration
        );

        return response;
    }

    public async Task<LoginResponse?> RefreshAsync(string refreshToken)
    {
        if (string.IsNullOrWhiteSpace(refreshToken))
        {
            return null;
        }

        var hash = HashToken(refreshToken);
        var session = await _context.UserSessions
            .Include(s => s.User)
            .FirstOrDefaultAsync(s => s.RefreshTokenHash == hash);

        if (session == null || session.RevokedAt.HasValue || session.ExpiresAt <= DateTime.UtcNow)
        {
            return null;
        }

        var user = session.User;
        if (!user.Active || (user.LockedUntil.HasValue && user.LockedUntil.Value > DateTime.UtcNow))
        {
            return null;
        }

        var newRefreshToken = GenerateRefreshToken();
        var newRefreshExpiration = DateTime.UtcNow.AddDays(_refreshDays);
        var newSession = new UserSession
        {
            UserId = user.UserId,
            RefreshTokenHash = HashToken(newRefreshToken),
            ExpiresAt = newRefreshExpiration,
            Created = DateTime.UtcNow,
            ReplacedBySessionId = null
        };

        session.RevokedAt = DateTime.UtcNow;
        _context.UserSessions.Add(newSession);
        await _context.SaveChangesAsync();

        session.ReplacedBySessionId = newSession.SessionId;
        await _context.SaveChangesAsync();

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
