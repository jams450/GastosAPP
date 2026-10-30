using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Email;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace GastosApp.BusinessLogic.Services;

/// <summary>
/// Aplica las reglas del usuario a un correo. Lee reglas y etiquetas, no escribe: quien decide qué
/// hacer con el veredicto es la capa que llama.
/// </summary>
public class EmailClassificationService : IEmailClassificationService
{
    private readonly IRepository _repository;
    private readonly EmailClassifierOptions _options;

    public EmailClassificationService(IRepository repository, IOptions<EmailClassifierOptions> options)
    {
        _repository = repository;
        _options = options.Value;
    }

    public async Task<EmailClassificationResult> ClassifyAsync(
        int userId,
        EmailMessageCandidate candidate,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(candidate);

        // Un candidato sin fecha no es "viejo": es un dato faltante. Tratarlo como viejo descartaría
        // correo válido por un fallo de la fuente, que es peor que clasificarlo de más.
        if (candidate.ReceivedAt != default
            && !EmailRuleEvaluator.IsWithinAgeLimit(candidate.ReceivedAt, DateTime.UtcNow, _options.DropOlderThanDays))
        {
            return EmailClassificationResult.TooOld();
        }

        // La normalización del texto del correo es C#-side, igual que en catalog_rules, así que el
        // prefiltro solo acota por dueño y estado y el orden se resuelve en memoria.
        var rules = await _repository
            .Get<EmailRule>(rule => rule.UserId == userId && rule.Active)
            .Include(rule => rule.TargetLabel)
            .OrderBy(rule => rule.Priority)
            .ThenBy(rule => rule.EmailRuleId)
            .ToListAsync(cancellationToken);

        // Una lectura sin seguimiento no reconstruye relaciones recursivas. Traemos los grupos
        // planos con sus condiciones y enlazamos todos los niveles antes de evaluar; sin esta carga
        // el motor caía en la condición legacy reflejada y perdía las restricciones AND/OR.
        var ruleIds = rules.Select(rule => rule.EmailRuleId).ToArray();
        if (ruleIds.Length > 0)
        {
            var groups = await _repository
                .Get<EmailRuleGroup>(group => ruleIds.Contains(group.EmailRuleId))
                .Include(group => group.Conditions)
                .OrderBy(group => group.GroupId)
                .ToListAsync(cancellationToken);

            var byRule = groups.ToLookup(group => group.EmailRuleId);
            foreach (var rule in rules)
            {
                var ruleGroups = byRule[rule.EmailRuleId].ToList();
                var byParent = ruleGroups.ToLookup(group => group.ParentGroupId);
                foreach (var group in ruleGroups)
                {
                    group.Children = byParent[group.GroupId].ToList();
                }

                rule.Groups = ruleGroups.Where(group => group.ParentGroupId is null).ToList();
            }
        }

        var match = EmailRuleEvaluator.Match(rules, candidate);
        return match is null ? EmailClassificationResult.Review() : EmailClassificationResult.FromMatch(match);
    }
}
