using GastosApp.BusinessLogic.Interfaces;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.BusinessLogic.Services;

/// <summary>
/// CRUD de reglas de clasificación de correo. Una regla puede expresarse de dos maneras y el servicio
/// garantiza que solo una quede escrita: si llega un árbol AND/OR, manda el árbol y las columnas planas
/// se vacían; si no llega árbol, se guarda la condición única de siempre. Guardar las dos sería dejar
/// dos verdades para la misma condición, que es justo lo que el modelo nuevo vino a retirar.
/// </summary>
public class EmailRuleService : IEmailRuleService
{
    private const int MaxNameLength = 120;
    private const int MaxMatchValueLength = 200;

    /// <summary>Mismo tope que el evaluador: la relación padre-hijo vive en la base y puede tener ciclos.</summary>
    private const int MaxGroupDepth = 10;

    private readonly IRepository _repository;

    public EmailRuleService(IRepository repository)
    {
        _repository = repository;
    }

    public async Task<IEnumerable<EmailRule>> GetByUserIdAsync(int userId, bool onlyActive = false)
    {
        var rules = await _repository
            .Get<EmailRule>(rule => rule.UserId == userId && (!onlyActive || rule.Active))
            .AsNoTracking()
            .Include(rule => rule.TargetLabel)
            .OrderBy(rule => rule.Priority)
            .ThenBy(rule => rule.EmailRuleId)
            .ToListAsync();

        var ids = rules.Select(rule => rule.EmailRuleId).ToArray();
        if (ids.Length > 0)
        {
            // Cuenta todos los niveles por la pertenencia a la regla, no solo las condiciones raíz.
            var groupCounts = await _repository.Get<EmailRuleGroup>(group => ids.Contains(group.EmailRuleId))
                .Select(group => new { group.EmailRuleId, Count = group.Conditions.Count })
                .ToListAsync();
            var counts = groupCounts.GroupBy(group => group.EmailRuleId)
                .ToDictionary(groups => groups.Key, groups => groups.Sum(group => group.Count));
            foreach (var rule in rules)
            {
                rule.ConditionCount = counts.GetValueOrDefault(rule.EmailRuleId, 1);
            }
        }
        return rules;
    }

    public async Task<EmailRule?> GetByIdAsync(int id, int userId)
    {
        var rule = await _repository
            .Get<EmailRule>(candidate => candidate.EmailRuleId == id && candidate.UserId == userId)
            .AsNoTracking()
            .Include(candidate => candidate.TargetLabel)
            .FirstOrDefaultAsync();

        if (rule is null)
        {
            return null;
        }

        rule.Groups = await LoadTreeAsync(id);
        return rule;
    }

    public async Task<EmailRule> CreateAsync(EmailRule rule, int userId)
    {
        var (name, priority) = ValidateBasics(rule);
        await ResolveActionAsync(rule, userId);

        var root = rule.Groups.FirstOrDefault();
        if (root is not null)
        {
            ValidateGroupOrThrow(root, depth: 0);
            MirrorLegacyCondition(rule, root);
            BindGroupTree(rule, root);
        }
        else
        {
            ApplyLegacyCondition(rule);
        }

        rule.UserId = userId;
        rule.Name = name;
        rule.Priority = priority;
        rule.Created = DateTime.UtcNow;

        return await _repository.Save(rule);
    }

    public async Task<EmailRule?> UpdateAsync(int id, EmailRule rule, int userId)
    {
        // Se lee sin seguimiento y se adjunta para mutar: el contexto queda con la regla en estado
        // Unchanged, igual que con una lectura rastreada, pero sin arrastrar navegaciones que esta
        // operación reemplaza de todos modos.
        var existing = await _repository
            .Get<EmailRule>(candidate => candidate.EmailRuleId == id && candidate.UserId == userId)
            .FirstOrDefaultAsync();
        if (existing == null)
        {
            return null;
        }

        _repository.GetTrack<EmailRule>().Attach(existing); // alcance-por-referencia: la regla se leyó justo arriba con EmailRuleId == id && UserId == userId; Attach solo la marca para mutarla, no consulta la base.

        var (name, priority) = ValidateBasics(rule);
        await ResolveActionAsync(rule, userId);

        var root = rule.Groups.FirstOrDefault();
        if (root is not null)
        {
            ValidateGroupOrThrow(root, depth: 0);
            MirrorLegacyCondition(rule, root);
        }
        else
        {
            ApplyLegacyCondition(rule);
        }

        await _repository.ExecuteInTransactionAsync(async () =>
        {
            // El árbol se reemplaza completo: intentar diferenciar altas, bajas y cambios de una
            // estructura recursiva es donde aparecen los grupos huérfanos. Se borra y se vuelve a
            // escribir dentro de la misma transacción, así nadie lee la regla a medio reemplazar.
            var stale = await _repository
                .Get<EmailRuleGroup>(group => group.EmailRuleId == id)
                .ToListAsync();

            if (stale.Count > 0)
            {
                await _repository.RemoveRangeAsync(stale);
                await _repository.SaveChangesAsync();
            }

            existing.Name = name;
            existing.MatchField = rule.MatchField;
            existing.MatchType = rule.MatchType;
            existing.MatchValue = rule.MatchValue;
            existing.Action = rule.Action;
            existing.TargetLabelId = rule.TargetLabelId;
            existing.Priority = priority;
            existing.Active = rule.Active;
            existing.Updated = DateTime.UtcNow;
            existing.Groups = root is null ? new List<EmailRuleGroup>() : new List<EmailRuleGroup> { root };
            if (root is not null)
            {
                // Se enlaza a la regla ya guardada, no a la que vino en la petición: las filas del
                // árbol cuelgan de la existente.
                BindGroupTree(existing, root);
            }

            await _repository.SaveChangesAsync();
            return true;
        });

        return await GetByIdAsync(id, userId);
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
    /// Reconstruye el árbol en memoria. EF no puede cargar una profundidad arbitraria con
    /// <c>Include</c>, así que se traen todos los grupos de la regla planos y se enlazan por padre.
    /// </summary>
    private async Task<List<EmailRuleGroup>> LoadTreeAsync(int ruleId)
    {
        var groups = await _repository
            .Get<EmailRuleGroup>(group => group.EmailRuleId == ruleId)
            .AsNoTracking()
            .Include(group => group.Conditions)
            .OrderBy(group => group.GroupId)
            .ToListAsync();

        var byParent = groups.ToLookup(group => group.ParentGroupId);
        foreach (var group in groups)
        {
            group.Children = byParent[group.GroupId].ToList();
        }

        return groups.Where(group => group.ParentGroupId is null).ToList();
    }

    private static (string Name, int Priority) ValidateBasics(EmailRule rule)
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

        return (name, rule.Priority);
    }

    /// <summary>
    /// Valida el grupo y sus descendientes. Un grupo vacío se rechaza en vez de guardarse: no puede
    /// casar nunca, y una regla que nunca casa se lee como «el clasificador no funciona».
    /// </summary>
    private static void ValidateGroupOrThrow(EmailRuleGroup group, int depth)
    {
        if (depth > MaxGroupDepth)
        {
            throw new ArgumentException($"La regla anida más de {MaxGroupDepth} niveles de grupos");
        }

        var combinator = (group.Combinator ?? string.Empty).Trim().ToLowerInvariant();
        if (combinator is not (EmailRuleGroupCombinator.And or EmailRuleGroupCombinator.Or))
        {
            throw new ArgumentException(
                $"combinator inválido: se espera {EmailRuleGroupCombinator.And} o {EmailRuleGroupCombinator.Or}");
        }

        group.Combinator = combinator;

        if (group.Conditions.Count == 0 && group.Children.Count == 0)
        {
            throw new ArgumentException("Hay un grupo sin condiciones: una regla vacía nunca casaría");
        }

        foreach (var condition in group.Conditions)
        {
            var (matchField, matchType, matchValue) = NormalizeConditionOrThrow(
                condition.MatchField,
                condition.MatchType,
                condition.MatchValue);

            condition.MatchField = matchField;
            condition.MatchType = matchType;
            condition.MatchValue = matchValue;
        }

        foreach (var child in group.Children)
        {
            ValidateGroupOrThrow(child, depth + 1);
        }
    }

    private static void ApplyLegacyCondition(EmailRule rule)
    {
        var (matchField, matchType, matchValue) = NormalizeConditionOrThrow(
            rule.MatchField,
            rule.MatchType,
            rule.MatchValue);

        rule.MatchField = matchField;
        rule.MatchType = matchType;
        rule.MatchValue = matchValue;
        rule.Groups = new List<EmailRuleGroup>();
    }

    /// <summary>
    /// Con árbol, las columnas planas no significan nada, pero la tabla las declara <c>NOT NULL</c> con
    /// un <c>CHECK</c> sobre los valores válidos: vaciarlas no es posible, PostgreSQL rechaza la fila.
    /// Se refleja la primera condición para que el registro siga siendo válido y legible desde la base;
    /// el motor las ignora cuando hay grupos, así que no hay dos verdades activas.
    /// </summary>
    private static void MirrorLegacyCondition(EmailRule rule, EmailRuleGroup root)
    {
        var first = FirstCondition(root);

        rule.MatchField = first?.MatchField ?? EmailRuleMatchField.Sender;
        rule.MatchType = first?.MatchType ?? EmailRuleMatchType.Contains;
        rule.MatchValue = first?.MatchValue ?? string.Empty;
    }

    /// <summary>
    /// Ancla cada grupo del árbol a la regla dueña por la navegación, nunca copiando el id. En un alta
    /// el id todavía no existe —lo genera la base al insertar—, así que copiarlo dejaría
    /// <c>email_rule_id = 0</c> en los grupos anidados y PostgreSQL rechazaría la fila con
    /// <c>fk_email_rule_groups_rule</c>, que es el fallo que se veía al editar una regla con subgrupos.
    /// Con la navegación puesta, EF propaga la clave temporal y luego la real a cada descendiente.
    /// <para>
    /// <see cref="EmailRule.Groups"/> son <b>todos</b> los grupos de la regla, no solo la raíz: el árbol
    /// se arma por <see cref="EmailRuleGroup.ParentGroupId"/>. Por eso acá no se agregan los
    /// descendientes a esa colección; solo se enlaza su padre y EF hace el resto.
    /// </para>
    /// </summary>
    /// <param name="owner">Regla que queda como dueña de todas las filas del árbol.</param>
    /// <param name="root">Grupo raíz del árbol recibido.</param>
    private static void BindGroupTree(EmailRule owner, EmailRuleGroup root)
    {
        root.EmailRule = owner;
        BindDescendantGroups(owner, root);
    }

    private static void BindDescendantGroups(EmailRule owner, EmailRuleGroup parent)
    {
        foreach (var child in parent.Children)
        {
            child.EmailRule = owner;
            child.ParentGroup = parent;
            BindDescendantGroups(owner, child);
        }
    }

    /// <summary>Primera condición del árbol en profundidad; la raíz primero, luego sus subgrupos.</summary>
    private static EmailRuleCondition? FirstCondition(EmailRuleGroup group)
    {
        if (group.Conditions.Count > 0)
        {
            return group.Conditions.First();
        }

        foreach (var child in group.Children)
        {
            var found = FirstCondition(child);
            if (found is not null)
            {
                return found;
            }
        }

        return null;
    }

    private static (string MatchField, string MatchType, string MatchValue) NormalizeConditionOrThrow(
        string? matchField,
        string? matchType,
        string? matchValue)
    {
        var field = (matchField ?? string.Empty).Trim().ToLowerInvariant();
        if (field is not (EmailRuleMatchField.Sender or EmailRuleMatchField.SenderDomain or EmailRuleMatchField.Subject))
        {
            throw new ArgumentException(
                $"match_field inválido: se espera {EmailRuleMatchField.Sender}, {EmailRuleMatchField.SenderDomain} o {EmailRuleMatchField.Subject}");
        }

        var type = (matchType ?? string.Empty).Trim().ToLowerInvariant();
        if (type is not (EmailRuleMatchType.Contains or EmailRuleMatchType.Exact
            or EmailRuleMatchType.StartsWith or EmailRuleMatchType.EndsWith))
        {
            throw new ArgumentException(
                $"match_type inválido: se espera {EmailRuleMatchType.Contains}, {EmailRuleMatchType.Exact}, {EmailRuleMatchType.StartsWith} o {EmailRuleMatchType.EndsWith}");
        }

        var value = CatalogTextNormalizer.Normalize(matchValue);
        if (value.Length == 0)
        {
            throw new ArgumentException("El valor de una condición es requerido");
        }

        if (value.Length > MaxMatchValueLength)
        {
            throw new ArgumentException($"El valor de una condición no puede exceder {MaxMatchValueLength} caracteres");
        }

        return (field, type, value);
    }

    /// <summary>
    /// Valida la acción y deja la etiqueta en el único estado que la base acepta: requerida para
    /// <c>assign_label</c>, nula para <c>review</c> y <c>llm</c>.
    /// <para>
    /// Una etiqueta que llega con una acción terminal se limpia en vez de rechazar la petición: el
    /// formulario pudo mandar la que tenía seleccionada al cambiar de acción, y guardarla sería dejar
    /// un destino que nadie aplica. El <c>CHECK</c> de la base lo prohibiría de todos modos.
    /// </para>
    /// <para>
    /// El dueño de la etiqueta solo se comprueba cuando de verdad se va a asignar: una regla terminal
    /// no apunta a ninguna etiqueta, así que exigirle una sería pedir un dato que no usa.
    /// </para>
    /// </summary>
    private async Task ResolveActionAsync(EmailRule rule, int userId)
    {
        var action = EmailRuleAction.Normalize(rule.Action);
        if (action is null)
        {
            throw new ArgumentException(
                $"action inválida: se espera {EmailRuleAction.AssignLabel}, {EmailRuleAction.Review} o {EmailRuleAction.Llm}");
        }

        rule.Action = action;

        if (action != EmailRuleAction.AssignLabel)
        {
            rule.TargetLabelId = null;
            rule.TargetLabel = null;
            return;
        }

        if (rule.TargetLabelId is not int labelId)
        {
            throw new ArgumentException("Una regla que asigna etiqueta necesita una etiqueta destino");
        }

        await EnsureLabelBelongsToUserAsync(labelId, userId);
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
}
