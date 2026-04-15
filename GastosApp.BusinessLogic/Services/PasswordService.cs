using System.Security.Cryptography;
using System.Text;
using GastosApp.BusinessLogic.Interfaces;
using Microsoft.Extensions.Configuration;

namespace GastosApp.BusinessLogic.Services;

public class PasswordService : IPasswordService
{
    private readonly string _key;
    private readonly string _iv;

    public PasswordService(IConfiguration configuration)
    {
        _key = configuration["Encryption:Key"] ?? throw new InvalidOperationException("Encryption:Key not configured");
        _iv = configuration["Encryption:IV"] ?? throw new InvalidOperationException("Encryption:IV not configured");
        
        // Asegurar que la key sea de 32 bytes (256 bits) para AES256
        if (_key.Length < 32)
            _key = _key.PadRight(32, '0');
        else if (_key.Length > 32)
            _key = _key.Substring(0, 32);
            
        // Asegurar que el IV sea de 16 bytes (128 bits)
        if (_iv.Length < 16)
            _iv = _iv.PadRight(16, '0');
        else if (_iv.Length > 16)
            _iv = _iv.Substring(0, 16);
    }

    public string HashPassword(string password)
    {
        using (Aes aes = Aes.Create())
        {
            aes.Key = Encoding.UTF8.GetBytes(_key);
            aes.IV = Encoding.UTF8.GetBytes(_iv);
            aes.Mode = CipherMode.CBC;
            aes.Padding = PaddingMode.PKCS7;

            using (ICryptoTransform encryptor = aes.CreateEncryptor())
            {
                byte[] passwordBytes = Encoding.UTF8.GetBytes(password);
                byte[] encryptedBytes = encryptor.TransformFinalBlock(passwordBytes, 0, passwordBytes.Length);
                return Convert.ToBase64String(encryptedBytes);
            }
        }
    }

    public bool VerifyPassword(string password, string hashedPassword)
    {
        try
        {
            using (Aes aes = Aes.Create())
            {
                aes.Key = Encoding.UTF8.GetBytes(_key);
                aes.IV = Encoding.UTF8.GetBytes(_iv);
                aes.Mode = CipherMode.CBC;
                aes.Padding = PaddingMode.PKCS7;

                using (ICryptoTransform decryptor = aes.CreateDecryptor())
                {
                    byte[] encryptedBytes = Convert.FromBase64String(hashedPassword);
                    byte[] decryptedBytes = decryptor.TransformFinalBlock(encryptedBytes, 0, encryptedBytes.Length);
                    string decryptedPassword = Encoding.UTF8.GetString(decryptedBytes);
                    return password == decryptedPassword;
                }
            }
        }
        catch
        {
            return false;
        }
    }
}
