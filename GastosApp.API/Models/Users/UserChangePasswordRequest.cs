using System.ComponentModel.DataAnnotations;

namespace GastosApp.API.Models.Users;

public class UserChangePasswordRequest
{
    [Required]
    [StringLength(255, MinimumLength = 8)]
    public string NewPassword { get; set; } = string.Empty;
}
