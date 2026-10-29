using GastosApp.Models.Entities;

namespace GastosApp.BusinessLogic.Interfaces;

/// <summary>
/// CRUD de reglas de clasificación de correo. Cada regla apunta a una etiqueta del propio dueño.
/// </summary>
public interface IEmailRuleService
{
    Task<IEnumerable<EmailRule>> GetByUserIdAsync(int userId, bool onlyActive = false);

    Task<EmailRule?> GetByIdAsync(int id, int userId);

    Task<EmailRule> CreateAsync(EmailRule rule, int userId);

    Task<EmailRule?> UpdateAsync(int id, EmailRule rule, int userId);

    Task<bool> SetActiveAsync(int id, int userId, bool active);
}
