using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Email;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.BusinessLogic.Services;

/// <summary>
/// Catálogo de etiquetas y carpetas del clasificador. Las semillas del sistema se crean una vez por
/// usuario y no se borran: borrar una etiqueta en uso dejaría reglas apuntando al vacío, así que el
/// ciclo de vida es activar y desactivar, igual que en el resto de los catálogos.
/// </summary>
public class EmailLabelService : IEmailLabelService
{
    private const int MaxNameLength = 80;
    private const int MaxSlugLength = 80;
    private const int MaxDescriptionLength = 500;

    /// <summary>
    /// Semillas por defecto. «Otros» es una etiqueta normal con comportamiento <c>none</c>, no un
    /// caso especial del motor: si mañana debe generar borrador, se cambia su comportamiento.
    /// </summary>
    private static readonly (string Slug, string Name, string Kind, string Behavior, int SortOrder)[] Defaults =
    {
        ("gastos", "Gastos", EmailLabelKind.Folder, EmailLabelBehavior.Expense, 10),
        ("banco", "Banco", EmailLabelKind.Folder, EmailLabelBehavior.Expense, 20),
        ("ingresos", "Ingresos", EmailLabelKind.Folder, EmailLabelBehavior.Income, 30),
        ("avisos", "Avisos", EmailLabelKind.Folder, EmailLabelBehavior.Ignore, 40),
        ("otros", "Otros", EmailLabelKind.Label, EmailLabelBehavior.None, 90)
    };

    private readonly IRepository _repository;

    public EmailLabelService(IRepository repository)
    {
        _repository = repository;
    }

    public async Task<IEnumerable<EmailLabel>> GetByUserIdAsync(int userId, bool onlyActive = false)
    {
        return await _repository
            .Get<EmailLabel>(label => label.UserId == userId && (!onlyActive || label.Active))
            .OrderBy(label => label.SortOrder)
            .ThenBy(label => label.LabelId)
            .ToListAsync();
    }

    public async Task<EmailLabel?> GetByIdAsync(int id, int userId)
    {
        return await _repository
            .Get<EmailLabel>(label => label.LabelId == id && label.UserId == userId)
            .FirstOrDefaultAsync();
    }

    /// <summary>
    /// Crea las etiquetas del sistema que falten. Es idempotente por <c>slug</c>: se puede llamar en
    /// cada arranque de una corrida sin duplicar nada, y respeta lo que el usuario haya cambiado.
    /// </summary>
    public async Task<int> EnsureDefaultsAsync(int userId)
    {
        var existing = await _repository
            .Get<EmailLabel>(label => label.UserId == userId)
            .Select(label => label.Slug)
            .ToListAsync();

        var created = 0;
        foreach (var (slug, name, kind, behavior, sortOrder) in Defaults)
        {
            if (existing.Contains(slug, StringComparer.Ordinal))
            {
                continue;
            }

            await _repository.Save(new EmailLabel
            {
                UserId = userId,
                Name = name,
                Slug = slug,
                Kind = kind,
                Behavior = behavior,
                SortOrder = sortOrder,
                IsSystem = true,
                Active = true,
                Created = DateTime.UtcNow
            });
            created++;
        }

        return created;
    }

    public async Task<EmailLabel> CreateAsync(EmailLabel label, int userId)
    {
        var (name, slug, kind, behavior, description) = NormalizeOrThrow(label);
        await EnsureSlugIsFreeAsync(userId, slug, exceptLabelId: null);

        label.UserId = userId;
        label.Name = name;
        label.Slug = slug;
        label.Kind = kind;
        label.Behavior = behavior;
        label.Description = description;
        label.IsSystem = false;
        label.Created = DateTime.UtcNow;

        return await _repository.Save(label);
    }

    public async Task<EmailLabel?> UpdateAsync(int id, EmailLabel label, int userId)
    {
        var existing = await _repository.GetTrack<EmailLabel>()
            .FirstOrDefaultAsync(candidate => candidate.LabelId == id && candidate.UserId == userId);
        if (existing == null)
        {
            return null;
        }

        var (name, slug, kind, behavior, description) = NormalizeOrThrow(label);
        await EnsureSlugIsFreeAsync(userId, slug, exceptLabelId: id);

        existing.Name = name;
        existing.Slug = slug;
        existing.Kind = kind;
        existing.Behavior = behavior;
        existing.Description = description;
        existing.Color = label.Color;
        existing.SortOrder = label.SortOrder;
        existing.Active = label.Active;
        existing.Updated = DateTime.UtcNow;

        await _repository.SaveChangesAsync();
        return existing;
    }

    public async Task<bool> SetActiveAsync(int id, int userId, bool active)
    {
        var existing = await _repository.GetTrack<EmailLabel>()
            .FirstOrDefaultAsync(candidate => candidate.LabelId == id && candidate.UserId == userId);
        if (existing == null)
        {
            return false;
        }

        existing.Active = active;
        existing.Updated = DateTime.UtcNow;
        await _repository.SaveChangesAsync();
        return true;
    }

    private async Task EnsureSlugIsFreeAsync(int userId, string slug, int? exceptLabelId)
    {
        var taken = await _repository
            .Get<EmailLabel>(label => label.UserId == userId && label.Slug == slug
                && (exceptLabelId == null || label.LabelId != exceptLabelId))
            .AnyAsync();

        if (taken)
        {
            throw new ArgumentException($"Ya existe una etiqueta con el identificador '{slug}'");
        }
    }

    private static (string Name, string Slug, string Kind, string Behavior, string? Description) NormalizeOrThrow(EmailLabel label)
    {
        if (string.IsNullOrWhiteSpace(label.Name))
        {
            throw new ArgumentException("El nombre de la etiqueta es requerido");
        }

        var name = label.Name.Trim();
        if (name.Length > MaxNameLength)
        {
            throw new ArgumentException($"El nombre de la etiqueta no puede exceder {MaxNameLength} caracteres");
        }

        // El slug es la identidad estable: si no viene, se deriva del nombre. Se normaliza igual que
        // el texto de las reglas para que no dependa de acentos ni mayúsculas.
        var slug = string.IsNullOrWhiteSpace(label.Slug)
            ? CatalogTextNormalizer.Normalize(name).Replace(' ', '-')
            : CatalogTextNormalizer.Normalize(label.Slug).Replace(' ', '-');

        if (slug.Length == 0)
        {
            throw new ArgumentException("El identificador de la etiqueta es requerido");
        }

        if (slug.Length > MaxSlugLength)
        {
            throw new ArgumentException($"El identificador no puede exceder {MaxSlugLength} caracteres");
        }

        var kind = (label.Kind ?? string.Empty).Trim().ToLowerInvariant();
        if (kind is not (EmailLabelKind.Folder or EmailLabelKind.Label))
        {
            throw new ArgumentException(
                $"kind inválido: se espera {EmailLabelKind.Folder} o {EmailLabelKind.Label}");
        }

        var behavior = (label.Behavior ?? string.Empty).Trim().ToLowerInvariant();
        if (behavior is not (EmailLabelBehavior.Expense or EmailLabelBehavior.Income
            or EmailLabelBehavior.Ignore or EmailLabelBehavior.None))
        {
            throw new ArgumentException(
                $"behavior inválido: se espera {EmailLabelBehavior.Expense}, {EmailLabelBehavior.Income}, {EmailLabelBehavior.Ignore} o {EmailLabelBehavior.None}");
        }

        var description = string.IsNullOrWhiteSpace(label.Description) ? null : label.Description.Trim();
        if (description is { Length: > MaxDescriptionLength })
        {
            throw new ArgumentException($"La descripción no puede exceder {MaxDescriptionLength} caracteres");
        }

        return (name, slug, kind, behavior, description);
    }
}
