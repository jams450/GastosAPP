using GastosApp.Models.Entities;

namespace GastosApp.BusinessLogic.Interfaces;

/// <summary>
/// Catálogo de etiquetas y carpetas del clasificador de correo, por dueño.
/// </summary>
public interface IEmailLabelService
{
    Task<IEnumerable<EmailLabel>> GetByUserIdAsync(int userId, bool onlyActive = false);

    Task<EmailLabel?> GetByIdAsync(int id, int userId);

    Task<EmailLabel> CreateAsync(EmailLabel label, int userId);

    Task<EmailLabel?> UpdateAsync(int id, EmailLabel label, int userId);

    Task<bool> SetActiveAsync(int id, int userId, bool active);

    /// <summary>Crea las etiquetas del sistema que falten. Idempotente por <c>slug</c>.</summary>
    Task<int> EnsureDefaultsAsync(int userId);
}
