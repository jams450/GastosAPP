using System.Collections;
using System.Linq.Expressions;
using System.Reflection;
using GastosApp.BusinessLogic.Context;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Services;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Query;

namespace GastosApp.Backend.Tests;

/// <summary>
/// Persistencia del árbol AND/OR de las reglas de correo.
/// <para>
/// El bug que estas pruebas cierran se vio en producción al guardar la regla 6: PostgreSQL rechazó el
/// INSERT con <c>23503 fk_email_rule_groups_rule</c>. La causa no era la base sino el grafo que se
/// entregaba a EF: la relación <c>EmailRule.Groups</c> solo alcanza al grupo raíz, así que los grupos
/// anidados llegaban con <c>email_rule_id = 0</c> y ese cero no es una fila de <c>email_rules</c>.
/// Se reproducía igual en el alta, donde el id de la regla todavía no existe.
/// </para>
/// <para>
/// Todo se comprueba sobre un <see cref="ContextSqlGastos"/> real con Npgsql y una cadena de conexión
/// de relleno: el seguimiento de cambios de EF (claves temporales incluidas) es exactamente el que
/// corre en producción, y construir el contexto no abre conexión. El repositorio es un doble que
/// detiene la unidad de trabajo justo antes del <c>INSERT</c>, así que estas pruebas <b>no</b> prueban
/// la restricción de PostgreSQL: prueban el valor con el que EF iba a escribir cada fila hija.
/// </para>
/// </summary>
public class EmailRulePersistenceTests
{
    private const int UserId = 1;
    private const int LabelId = 3;
    private const int ExistingRuleId = 6;

    private const string UnusedConnectionString =
        "Host=127.0.0.1;Port=5432;Database=email_rule_probe;Username=probe;Password=probe;Timeout=1";

    [Fact]
    public async Task Create_binds_every_nested_group_to_the_key_the_database_will_generate()
    {
        using var context = CreateContext();
        var repository = CreateRepository(context, ExistingRuleId, staleGroupIds: []);
        var service = new EmailRuleService(repository);
        var rule = BuildRule(BuildThreeLevelTree());

        await service.CreateAsync(rule, UserId);

        var snapshot = Assert.IsType<Snapshot>(Recorder(repository).LastSnapshot);
        var ruleEntry = Assert.Single(snapshot.Rules);
        Assert.Equal(EntityState.Added, ruleEntry.State);
        // La clave todavía es temporal: la genera PostgreSQL dentro del INSERT, así que el árbol no
        // puede copiarla; tiene que colgar de la navegación para que EF la sustituya.
        Assert.True(ruleEntry.KeyIsTemporary);
        Assert.NotEqual(0, ruleEntry.Key);

        var groups = snapshot.Groups.Where(group => group.State == EntityState.Added).ToList();
        Assert.Equal(3, groups.Count);
        Assert.All(
            groups,
            group => Assert.Equal(ruleEntry.Key, group.EmailRuleId));
        Assert.DoesNotContain(groups, group => group.EmailRuleId == 0);
        Assert.All(groups, group => Assert.Same(rule, group.Entity.EmailRule));

        AssertParentChain(groups);
    }

    [Fact]
    public async Task Update_binds_every_nested_group_to_the_rule_already_saved()
    {
        using var context = CreateContext();
        var repository = CreateRepository(context, ExistingRuleId, staleGroupIds: [60, 61]);
        var service = new EmailRuleService(repository);
        var rule = BuildRule(BuildThreeLevelTree());

        await service.UpdateAsync(ExistingRuleId, rule, UserId);

        var snapshot = Assert.IsType<Snapshot>(Recorder(repository).LastSnapshot);
        var ruleEntry = Assert.Single(snapshot.Rules);
        Assert.Equal(EntityState.Modified, ruleEntry.State);
        Assert.Equal(ExistingRuleId, ruleEntry.Key);
        Assert.False(ruleEntry.KeyIsTemporary);

        var added = snapshot.Groups.Where(group => group.State == EntityState.Added).ToList();
        Assert.Equal(3, added.Count);
        // El id de la regla se escribe en TODOS los niveles, no solo en la raíz.
        Assert.All(added, group => Assert.Equal(ExistingRuleId, group.EmailRuleId));
        AssertParentChain(added);

        // El árbol viejo se borra y no revive: los grupos eliminados no vuelven como Added.
        var deletedIds = snapshot.Groups
            .Where(group => group.State == EntityState.Deleted)
            .Select(group => group.GroupId)
            .ToList();
        Assert.Equal([60, 61], deletedIds.OrderBy(id => id).ToList());
        Assert.DoesNotContain(added, group => deletedIds.Contains(group.GroupId));
        Assert.Single(snapshot.Rules);
    }

    [Fact]
    public async Task Create_still_supports_a_single_level_group()
    {
        // Comportamiento previo que se conserva: un árbol de un solo nivel ya escribía bien su FK.
        using var context = CreateContext();
        var repository = CreateRepository(context, ExistingRuleId, staleGroupIds: []);
        var service = new EmailRuleService(repository);
        var root = Group(
            EmailRuleGroupCombinator.And,
            [Condition(EmailRuleMatchField.SenderDomain, EmailRuleMatchType.Exact, "netflix.com")]);
        var rule = BuildRule(root);

        await service.CreateAsync(rule, UserId);

        var snapshot = Assert.IsType<Snapshot>(Recorder(repository).LastSnapshot);
        var ruleEntry = Assert.Single(snapshot.Rules);
        var saved = Assert.Single(snapshot.Groups);
        Assert.Equal(EntityState.Added, saved.State);
        Assert.Equal(ruleEntry.Key, saved.EmailRuleId);
        Assert.Null(saved.ParentGroupId);
    }

    [Fact]
    public async Task Create_still_supports_the_flat_single_condition_rule()
    {
        // Comportamiento previo que se conserva: sin árbol manda la condición plana y no se escribe
        // ningún grupo.
        using var context = CreateContext();
        var repository = CreateRepository(context, ExistingRuleId, staleGroupIds: []);
        var service = new EmailRuleService(repository);
        var rule = new EmailRule
        {
            Name = "  Netflix  ",
            MatchField = "  SENDER ",
            MatchType = "Contains",
            MatchValue = "  Netflix México  ",
            TargetLabelId = LabelId
        };

        await service.CreateAsync(rule, UserId);

        var snapshot = Assert.IsType<Snapshot>(Recorder(repository).LastSnapshot);
        Assert.Empty(snapshot.Groups);
        Assert.Empty(rule.Groups);
        Assert.Equal("Netflix", rule.Name);
        Assert.Equal(EmailRuleMatchField.Sender, rule.MatchField);
        Assert.Equal(EmailRuleMatchType.Contains, rule.MatchType);
        Assert.Equal("netflix mexico", rule.MatchValue);
    }

    [Fact]
    public async Task Update_still_replaces_the_tree_with_the_flat_condition()
    {
        // Comportamiento previo que se conserva: al volver a la condición plana el árbol se borra y no
        // se inserta ningún grupo.
        using var context = CreateContext();
        var repository = CreateRepository(context, ExistingRuleId, staleGroupIds: [60, 61]);
        var service = new EmailRuleService(repository);
        var rule = new EmailRule
        {
            Name = "Plana",
            MatchField = EmailRuleMatchField.Subject,
            MatchType = EmailRuleMatchType.StartsWith,
            MatchValue = "  Pago  ",
            TargetLabelId = LabelId,
            Priority = 20,
            Active = false
        };

        await service.UpdateAsync(ExistingRuleId, rule, UserId);

        var snapshot = Assert.IsType<Snapshot>(Recorder(repository).LastSnapshot);
        Assert.DoesNotContain(snapshot.Groups, group => group.State == EntityState.Added);
        var deletedIds = snapshot.Groups
            .Where(group => group.State == EntityState.Deleted)
            .Select(group => group.GroupId)
            .OrderBy(id => id)
            .ToList();
        Assert.Equal([60, 61], deletedIds);

        var tracked = Assert.Single(snapshot.Rules).Entity;
        Assert.Equal("Plana", tracked.Name);
        Assert.Equal(EmailRuleMatchField.Subject, tracked.MatchField);
        Assert.Equal(EmailRuleMatchType.StartsWith, tracked.MatchType);
        Assert.Equal("pago", tracked.MatchValue);
        Assert.Equal(20, tracked.Priority);
        Assert.False(tracked.Active);
    }

    /// <summary>
    /// Un solo grupo raíz (el único que admite el índice parcial de la base) y una cadena de padres
    /// completa: si el anidamiento se hubiera aplanado, habría más de un grupo sin padre.
    /// </summary>
    private static void AssertParentChain(List<GroupSnapshot> groups)
    {
        var root = Assert.Single(groups, group => group.ParentGroupId is null);
        var child = Assert.Single(groups, group => group.ParentGroupId == root.GroupId);
        var grandchild = Assert.Single(groups, group => group.ParentGroupId == child.GroupId);

        Assert.Equal(EmailRuleGroupCombinator.And, root.Entity.Combinator);
        Assert.Equal(EmailRuleGroupCombinator.Or, child.Entity.Combinator);
        Assert.Equal(EmailRuleGroupCombinator.And, grandchild.Entity.Combinator);
        Assert.Same(root.Entity, child.Entity.ParentGroup);
        Assert.Same(child.Entity, grandchild.Entity.ParentGroup);
    }

    private static EmailRule BuildRule(EmailRuleGroup root) => new()
    {
        Name = "Mercado Libre",
        TargetLabelId = LabelId,
        Priority = 10,
        Active = true,
        Groups = new List<EmailRuleGroup> { root }
    };

    private static EmailRuleGroup BuildThreeLevelTree()
    {
        var grandchild = Group(
            EmailRuleGroupCombinator.And,
            [Condition(EmailRuleMatchField.Sender, EmailRuleMatchType.Contains, "avisos@mercadolibre.com")]);
        var child = Group(
            EmailRuleGroupCombinator.Or,
            [Condition(EmailRuleMatchField.Subject, EmailRuleMatchType.Contains, "compraste")],
            grandchild);
        return Group(
            EmailRuleGroupCombinator.And,
            [Condition(EmailRuleMatchField.SenderDomain, EmailRuleMatchType.Exact, "mercadolibre.com")],
            child);
    }

    private static EmailRuleGroup Group(string combinator, List<EmailRuleCondition> conditions, params EmailRuleGroup[] children) => new()
    {
        Combinator = combinator,
        Conditions = conditions,
        Children = children.ToList()
    };

    private static EmailRuleCondition Condition(string matchField, string matchType, string matchValue) => new()
    {
        MatchField = matchField,
        MatchType = matchType,
        MatchValue = matchValue
    };

    private static object Completed(object? value, Type resultType) =>
        typeof(Task).GetMethod(nameof(Task.FromResult))!
            .MakeGenericMethod(resultType)
            .Invoke(null, [value])!;

    private static ContextSqlGastos CreateContext()
    {
        var options = new DbContextOptionsBuilder<ContextSqlGastos>()
            .UseNpgsql(UnusedConnectionString)
            .Options;

        return new ContextSqlGastos(options, new AnonymousCurrentUser());
    }

    private static IRepository CreateRepository(
        ContextSqlGastos context,
        int existingRuleId,
        int[] staleGroupIds)
    {
        var rule = new EmailRule
        {
            EmailRuleId = existingRuleId,
            UserId = UserId,
            Name = "Regla anterior",
            MatchField = EmailRuleMatchField.Subject,
            MatchType = EmailRuleMatchType.Contains,
            MatchValue = "anterior",
            TargetLabelId = LabelId
        };
        var label = new EmailLabel
        {
            LabelId = LabelId,
            UserId = UserId,
            Name = "Gastos",
            Slug = "gastos",
            Behavior = EmailLabelBehavior.Expense,
            Active = true
        };
        // Grupos viejos con la forma con la que salen de la base: el hijo referencia a su padre.
        var stale = staleGroupIds
            .Select((groupId, index) => new EmailRuleGroup
            {
                GroupId = groupId,
                EmailRuleId = existingRuleId,
                ParentGroupId = index == 0 ? null : staleGroupIds[index - 1],
                Combinator = EmailRuleGroupCombinator.And
            })
            .ToList();

        var repository = DispatchProxy.Create<IRepository, RecordingRepository>();
        var recording = (RecordingRepository)(object)repository;
        recording.Context = context;
        recording.Sources = new Dictionary<Type, IQueryable>
        {
            [typeof(EmailRule)] = new[] { rule }.AsQueryable(),
            [typeof(EmailLabel)] = new[] { label }.AsQueryable(),
            [typeof(EmailRuleGroup)] = stale.AsQueryable()
        };
        return repository;
    }

    private static RecordingRepository Recorder(IRepository repository) => (RecordingRepository)(object)repository;

    /// <summary>Estado del seguimiento en el instante en que el repositorio real escribiría.</summary>
    public sealed record GroupSnapshot(
        EntityState State,
        int GroupId,
        int EmailRuleId,
        int? ParentGroupId,
        EmailRuleGroup Entity);

    public sealed record RuleSnapshot(EntityState State, int Key, bool KeyIsTemporary, EmailRule Entity);

    public sealed record Snapshot(List<RuleSnapshot> Rules, List<GroupSnapshot> Groups);

    /// <summary>
    /// Doble del repositorio: sirve las lecturas en memoria y detiene la escritura tras
    /// <c>DetectChanges</c>, que es el paso donde EF decide con qué valor va cada clave foránea.
    /// </summary>
    public class RecordingRepository : DispatchProxy
    {
        public ContextSqlGastos Context { get; set; } = null!;

        public Dictionary<Type, IQueryable> Sources { get; set; } = new();

        public Snapshot? LastSnapshot { get; private set; }

        protected override object? Invoke(MethodInfo? method, object?[]? args)
        {
            switch (method!.Name)
            {
                case "Get":
                {
                    var type = method.GetGenericArguments()[0];
                    var query = Sources[type];
                    if (args is { Length: 1 })
                    {
                        query = query.Provider.CreateQuery(Expression.Call(
                            typeof(Queryable),
                            "Where",
                            [type],
                            query.Expression,
                            Expression.Quote((LambdaExpression)args[0]!)));
                    }

                    return Activator.CreateInstance(typeof(AsyncQuery<>).MakeGenericType(type), query.Expression);
                }
                case "GetTrack":
                {
                    var type = method.GetGenericArguments()[0];
                    return typeof(DbContext).GetMethod(nameof(DbContext.Set), Type.EmptyTypes)!
                        .MakeGenericMethod(type)
                        .Invoke(Context, null);
                }
                case "Save":
                {
                    Context.Add(args![0]!);
                    Capture();
                    var type = method.GetGenericArguments()[0];
                    return Completed(args[0], type);
                }
                case "SaveChangesAsync":
                    Capture();
                    return Task.FromResult(0);
                case "RemoveRangeAsync":
                    Context.RemoveRange(((IEnumerable)args![0]!).Cast<object>());
                    return Task.FromResult(0);
                case "ExecuteInTransactionAsync":
                    return ((Delegate)args![0]!).DynamicInvoke();
                default:
                    throw new InvalidOperationException($"El guardado de reglas no debería llamar a {method.Name}.");
            }
        }

        private void Capture()
        {
            Context.ChangeTracker.DetectChanges();
            var rules = Context.ChangeTracker.Entries<EmailRule>()
                .Select(entry =>
                {
                    var key = entry.Property(rule => rule.EmailRuleId);
                    return new RuleSnapshot(entry.State, key.CurrentValue, key.IsTemporary, entry.Entity);
                })
                .ToList();
            var groups = Context.ChangeTracker.Entries<EmailRuleGroup>()
                .Select(entry => new GroupSnapshot(
                    entry.State,
                    entry.Property(group => group.GroupId).CurrentValue,
                    entry.Property(group => group.EmailRuleId).CurrentValue,
                    entry.Property(group => group.ParentGroupId).CurrentValue,
                    entry.Entity))
                .ToList();
            LastSnapshot = new Snapshot(rules, groups);
        }
    }

    private class AsyncQuery<T> : EnumerableQuery<T>, IAsyncEnumerable<T>, IQueryable<T>
    {
        public AsyncQuery(Expression expression) : base(expression) { }

        IQueryProvider IQueryable.Provider => new AsyncProvider(this);

        public IAsyncEnumerator<T> GetAsyncEnumerator(CancellationToken token = default) =>
            new AsyncEnumerator<T>(this.AsEnumerable().GetEnumerator());
    }

    private sealed class AsyncProvider(IQueryProvider inner) : IAsyncQueryProvider
    {
        public IQueryable CreateQuery(Expression expression) => inner.CreateQuery(expression);

        public IQueryable<T> CreateQuery<T>(Expression expression) => new AsyncQuery<T>(expression);

        public object? Execute(Expression expression) => inner.Execute(expression);

        public T Execute<T>(Expression expression) => inner.Execute<T>(expression);

        public T ExecuteAsync<T>(Expression expression, CancellationToken token = default)
        {
            var result = inner.Execute(expression);
            if (typeof(T).IsGenericType && typeof(T).GetGenericTypeDefinition() == typeof(Task<>))
            {
                // AnyAsync/FirstOrDefaultAsync piden Task<TResult>: EF espera la tarea, no el valor.
                return (T)Completed(result, typeof(T).GetGenericArguments()[0]);
            }

            if (typeof(T).IsGenericType && typeof(T).GetGenericTypeDefinition() == typeof(IAsyncEnumerable<>))
            {
                // ToListAsync pide un IAsyncEnumerable; el resto (Any, FirstOrDefault) pide el elemento.
                var adapter = typeof(AsyncEnumerableAdapter<>)
                    .MakeGenericType(typeof(T).GetGenericArguments()[0]);
                return (T)Activator.CreateInstance(adapter, result)!;
            }

            return (T)result!;
        }
    }

    private sealed class AsyncEnumerableAdapter<T>(object inner) : IAsyncEnumerable<T>
    {
        public IAsyncEnumerator<T> GetAsyncEnumerator(CancellationToken token = default) =>
            new AsyncEnumerator<T>(((IEnumerable<T>)inner).GetEnumerator());
    }

    private sealed class AsyncEnumerator<T>(IEnumerator<T> inner) : IAsyncEnumerator<T>
    {
        public T Current => inner.Current;

        public ValueTask<bool> MoveNextAsync() => ValueTask.FromResult(inner.MoveNext());

        public ValueTask DisposeAsync()
        {
            inner.Dispose();
            return ValueTask.CompletedTask;
        }
    }
}
