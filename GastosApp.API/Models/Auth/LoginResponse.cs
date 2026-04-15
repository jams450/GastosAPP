namespace GastosApp.API.Models.Auth;

public record LoginResponse(string Token, DateTime Expiration, string Username);
