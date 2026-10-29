using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.BusinessLogic.Services;

/// <summary>
/// CRUD de reglas de clasificación de correo. Misma forma que <see cref="CatalogRuleService"/>: el
/// valor de match se normaliza al escribir, y la prioridad menor gana. Lo distinto es que acá el
/// destino es siempre una etiqueta del propio usuario.
/// </summary>
public class EmailRuleService : IEmailRuleService
{
    private const int MaxNameLength = 120;
    private const int MaxMatchValueLength = 200;

    private readonly IRepository _repository;

    public EmailRuleService(IRepository repository)
    {
        _repository = repository;
    }

    public async Task<IEnumerable<EmailRule>> GetByUserIdAsync(int userId, bool onlyActive = false)
    {
        return await _repository
            .Get<EmailRule>(rule => rule.UserId == userId && (!onlyActive || rule.Active))
            .Include(rule => rule.TargetLabel)
            .OrderBy(rule => rule.Priority)
            .ThenBy(rule => rule.EmailRuleId)
            .ToListAsync();
    }

    public async Task<EmailRule?> GetByIdAsync(int id, int userId)
    {
        return await _repository
            .Get<EmailRule>(rule => rule.EmailRuleId == id && rule.UserId == userId)
            .Include(rule => rule.TargetLabel)
            .FirstOrDefaultAsync();
    }

    public async Task<EmailRule> CreateAsync(EmailRule rule, int userId)
    {
        var (name, matchField, matchType, matchValue) = NormalizeOrThrow(rule);
        await EnsureLabelBelongsToUserAsync(rule.TargetLabelId, userId);

        rule.UserId = userId;
        rule.Name = name;
        rule.MatchField = matchField;
        rule.MatchType = matchType;
        rule.MatchValue = matchValue;
        rule.Created = DateTime.UtcNow;

        return await _repository.Save(rule);
    }

    public async Task<EmailRule?> UpdateAsync(int id, EmailRule rule, int userId)
    {
        var existing = await _repository.GetTrack<EmailRule>()
            .FirstOrDefaultAsync(candidate => candidate.EmailRuleId == id && candidate.UserId == userId);
        if (existing == null)
        {
            return null;
        }

        var (name, matchField, matchType, matchValue) = NormalizeOrThrow(rule);
        await EnsureLabelBelongsToUserAsync(rule.TargetLabelId, userId);

        existing.Name = name;
        existing.MatchField = matchField;
        existing.MatchType = matchType;
        existing.MatchValue = matchValue;
        existing.TargetLabelId = rule.TargetLabelId;
        existing.Priority = rule.Priority;
        existing.Active = rule.Active;
        existing.Updated = DateTime.UtcNow;

        await _repository.SaveChangesAsync();
        return existing;
    }

    public async Task<bool> SetActiveAsync(int id, int userId, bool active)
    {
        var existing = await _repository.GetTrack<EmailRule>()
            .FirstOrDefaultAsync(candidate => candidate.EmailRuleId == id && candidate.UserId == userId);
        if (existing == null)
        {
            return false;
        }

        existing.Active = active;
        existing.Updated = DateTime.UtcNow;
        await _repository.SaveChangesAsync();
        return true;
    }

    /// <summary>
    /// Una regla solo puede apuntar a una etiqueta del propio dueño. Se permite la etiqueta inactiva
    /// a propósito: desactivar una etiqueta no debe impedir guardar la regla que la usa.
    /// </summary>
    private async Task EnsureLabelBelongsToUserAsync(int labelId, int userId)
    {
        var exists = await _repository
            .Get<EmailLabel>(label => label.LabelId == labelId && label.UserId == userId)
            .AnyAsync();

        if (!exists)
        {
            throw new ArgumentException($"Etiqueta con ID {labelId} no encontrada");
        }
    }

    private static (string Name, string MatchField, string MatchType, string MatchValue) NormalizeOrThrow(EmailRule rule)
    {
        if (string.IsNullOrWhiteSpace(rule.Name))
        {
            throw new ArgumentException("El nombre de la regla es requerido");
        }

        var name = rule.Name.Trim();
        if (name.Length > MaxNameLength)
        {
            throw new ArgumentException($"El nombre de la regla no puede exceder {MaxNameLength} caracteres");
        }

        var matchField = (rule.MatchField ?? string.Empty).Trim().ToLowerInvariant();
        if (matchField is not (EmailRuleMatchField.Sender or EmailRuleMatchField.SenderDomain or EmailRuleMatchField.Subject))
        {
            throw new ArgumentException(
                $"match_field inválido: se espera {EmailRuleMatchField.Sender}, {EmailRuleMatchField.SenderDomain} o {EmailRuleMatchField.Subject}");
        }

        var matchType = (rule.MatchType ?? string.Empty).Trim().ToLowerInvariant();
        if (matchType is not (EmailRuleMatchType.Contains or EmailRuleMatchType.Exact
            or EmailRuleMatchType.StartsWith or EmailRuleMatchType.EndsWith))
        {
            throw new ArgumentException(
                $"match_type inválido: se espera {EmailRuleMatchType.Contains}, {EmailRuleMatchType.Exact}, {EmailRuleMatchType.StartsWith} o {EmailRuleMatchType.EndsWith}");
        }

        var matchValue = CatalogTextNormalizer.Normalize(rule.MatchValue);
        if (matchValue.Length == 0)
        {
            throw new ArgumentException("El valor de match de la regla es requerido");
        }

        if (matchValue.Length > MaxMatchValueLength)
        {
            throw new ArgumentException($"El valor de match no puede exceder {MaxMatchValueLength} caracteres");
        }

        return (name, matchField, matchType, matchValue);
    }
}
