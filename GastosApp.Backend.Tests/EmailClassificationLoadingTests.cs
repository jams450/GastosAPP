using System.Collections;
using System.Linq.Expressions;
using System.Reflection;
using GastosApp.BusinessLogic.Interfaces;
using GastosApp.BusinessLogic.Models.Email;
using GastosApp.BusinessLogic.Services;
using GastosApp.Models.Entities;
using Microsoft.EntityFrameworkCore.Query;
using Microsoft.Extensions.Options;

namespace GastosApp.Backend.Tests;

public class EmailClassificationLoadingTests
{
    [Theory]
    [InlineData("avisos@mercadolibre.com", "Compraste un producto", true)]
    [InlineData("avisos@mercadolibre.com", "Pago confirmado", true)]
    [InlineData("avisos@mercadolibre.com", "Promoción semanal", false)]
    [InlineData("otro@ejemplo.com", "Compraste un producto", false)]
    public async Task Classifier_loads_flat_groups_and_evaluates_the_nested_tree(string sender, string subject, bool matches)
    {
        var label = new EmailLabel { LabelId = 7, Name = "Gastos", Slug = "gastos", Active = true, Behavior = EmailLabelBehavior.Expense };
        var rule = new EmailRule
        {
            EmailRuleId = 11, UserId = 1, Name = "Compras", Active = true, TargetLabelId = 7, TargetLabel = label,
            MatchField = "sender_domain", MatchType = "equals", MatchValue = "mercadolibre.com"
        };
        // Como en una lectura sin seguimiento: grupos planos, sin enlaces Children ni Rule.Groups.
        var groups = new[]
        {
            new EmailRuleGroup { GroupId = 21, EmailRuleId = 11, Combinator = "and", Conditions = new List<EmailRuleCondition>
            { new() { MatchField = "sender_domain", MatchType = "equals", MatchValue = "mercadolibre.com" } } },
            new EmailRuleGroup { GroupId = 22, EmailRuleId = 11, ParentGroupId = 21, Combinator = "or", Conditions = new List<EmailRuleCondition>
            {
                new() { MatchField = "subject", MatchType = "contains", MatchValue = "compraste" },
                new() { MatchField = "subject", MatchType = "contains", MatchValue = "pago confirmado" }
            } }
        };
        var repository = DispatchProxy.Create<IRepository, QueryRepository>();
        ((QueryRepository)(object)repository).Sources = new() { [typeof(EmailRule)] = new[] { rule }.AsQueryable(), [typeof(EmailRuleGroup)] = groups.AsQueryable() };
        var service = new EmailClassificationService(repository, Options.Create(new EmailClassifierOptions { DropOlderThanDays = 0 }));

        var result = await service.ClassifyAsync(1, new EmailMessageCandidate(sender, null, subject, DateTime.UtcNow));

        Assert.Equal(matches ? "rule" : "no_match", result.Reason);
        Assert.Equal(matches ? EmailClassificationOutcome.Expense : EmailClassificationOutcome.Review, result.Outcome);
        Assert.Equal(matches ? 11 : (int?)null, result.MatchedRuleId);
        Assert.Equal(matches ? 7 : (int?)null, result.LabelId);
    }

    [Fact]
    public async Task Classifier_keeps_supporting_flat_rules()
    {
        var repository = DispatchProxy.Create<IRepository, QueryRepository>();
        ((QueryRepository)(object)repository).Sources = new()
        {
            [typeof(EmailRule)] = new[] { new EmailRule { EmailRuleId = 1, UserId = 1, Active = true, MatchField = "subject", MatchType = "contains", MatchValue = "compra", TargetLabel = new EmailLabel { Active = true, Behavior = EmailLabelBehavior.Expense } } }.AsQueryable(),
            [typeof(EmailRuleGroup)] = Array.Empty<EmailRuleGroup>().AsQueryable()
        };
        var service = new EmailClassificationService(repository, Options.Create(new EmailClassifierOptions { DropOlderThanDays = 0 }));
        var result = await service.ClassifyAsync(1, new EmailMessageCandidate("a@example.com", null, "Compra confirmada", DateTime.UtcNow));
        Assert.Equal("rule", result.Reason);
        Assert.Equal(1, result.MatchedRuleId);
    }

    public class QueryRepository : DispatchProxy
    {
        public Dictionary<Type, IQueryable> Sources { get; set; } = new();
        protected override object? Invoke(MethodInfo? method, object?[]? args)
        {
            if (method!.Name != "Get") throw new InvalidOperationException("La clasificación no debe escribir datos.");
            var type = method.GetGenericArguments()[0];
            var query = Sources[type];
            if (args is { Length: 1 })
                query = query.Provider.CreateQuery(Expression.Call(typeof(Queryable), "Where", new[] { type }, query.Expression, Expression.Quote((LambdaExpression)args[0]!)));
            return Activator.CreateInstance(typeof(AsyncQuery<>).MakeGenericType(type), query.Expression);
        }
    }

    private class AsyncQuery<T> : EnumerableQuery<T>, IAsyncEnumerable<T>, IQueryable<T>
    {
        public AsyncQuery(Expression expression) : base(expression) { }
        IQueryProvider IQueryable.Provider => new AsyncProvider(this);
        public IAsyncEnumerator<T> GetAsyncEnumerator(CancellationToken token = default) => new AsyncEnumerator<T>(this.AsEnumerable().GetEnumerator());
    }

    private sealed class AsyncProvider(IQueryProvider inner) : IAsyncQueryProvider
    {
        public IQueryable CreateQuery(Expression expression) => inner.CreateQuery(expression);
        public IQueryable<T> CreateQuery<T>(Expression expression) => new AsyncQuery<T>(expression);
        public object? Execute(Expression expression) => inner.Execute(expression);
        public T Execute<T>(Expression expression) => inner.Execute<T>(expression);
        public T ExecuteAsync<T>(Expression expression, CancellationToken token = default) => throw new NotSupportedException();
    }

    private sealed class AsyncEnumerator<T>(IEnumerator<T> inner) : IAsyncEnumerator<T>
    {
        public T Current => inner.Current;
        public ValueTask<bool> MoveNextAsync() => ValueTask.FromResult(inner.MoveNext());
        public ValueTask DisposeAsync() { inner.Dispose(); return ValueTask.CompletedTask; }
    }
}
