using GastosApp.BusinessLogic.Context;
using Microsoft.EntityFrameworkCore;

namespace GastosApp.Backend.Tests;

/// <summary>
/// Pins the user-scoping convention for S6, the second half of T7.
/// <para>
/// The review found that user scoping is enforced by convention at every call site rather than by a
/// mechanism, so a new service can forget it and return another user's rows. The global-filter
/// alternative was rejected on evidence: it breaks login, silences the three background workers, and
/// would wrap the <c>FOR UPDATE</c> locking that the money paths depend on. This guardrail detects
/// the omission at build time instead, without changing runtime behaviour at all.
/// </para>
/// <para>
/// Honest limits, stated so nobody mistakes this for a proof: it inspects only
/// <c>_repository.Get&lt;T&gt;</c> and <c>_repository.GetTrack&lt;T&gt;</c> call sites in the business
/// layer, it decides by substring, and a member can always satisfy it by adding the marker without a
/// real reason. It converts a silent omission into a reviewed decision, which is the asymmetry worth
/// having.
/// </para>
/// </summary>
public class ScopingGuardrailTests
{
    private static readonly IReadOnlySet<string> Owned = new HashSet<string>(StringComparer.Ordinal)
    {
        "Budget", "BudgetItem"
    };

    // --- The scanner itself: these are the mutation proofs. --------------------------------

    [Fact]
    public void A_read_scoped_by_the_owning_user_is_accepted()
    {
        var source = "_repository.Get<Budget>(b => b.UserId == userId);";

        Assert.Empty(Find(source));
    }

    [Fact]
    public void A_read_scoped_later_in_the_fluent_chain_is_accepted()
    {
        // The reason the unit of inspection is the statement and not the call argument.
        var source = """
            _repository.GetTrack<BudgetItem>()
                .Where(i => i.UserId == userId && i.PeriodKey == periodKey)
                .ToListAsync();
            """;

        Assert.Empty(Find(source));
    }

    [Fact]
    public void A_read_scoped_by_the_owner_column_is_accepted()
    {
        // The check is a substring, so OwnerUserId counts; this documents that on purpose.
        var source = "_repository.Get<Budget>(b => b.OwnerUserId == ownerId);";

        Assert.Empty(Find(source));
    }

    [Fact]
    public void A_read_with_no_scoping_at_all_is_reported()
    {
        var offenders = Find("_repository.GetTrack<Budget>();");

        var offender = Assert.Single(offenders);
        Assert.Equal("Budget", offender.Entity);
    }

    [Fact]
    public void A_read_scoped_only_by_a_reference_must_say_so()
    {
        var unjustified = Find("_repository.Get<BudgetItem>(i => i.TransactionId == transactionId);");
        Assert.Single(unjustified);

        var justified = Find(
            "_repository.Get<BudgetItem>(i => i.TransactionId == transactionId); "
            + "// " + ScopingGuardrailScanner.ScopeByReferenceMarker + " la transacción ya se resolvió para este usuario");

        Assert.Empty(justified);
    }

    [Fact]
    public void An_entity_without_an_owner_column_is_ignored()
    {
        // The guardrail must not start demanding owner scoping from catalog and identity tables.
        Assert.Empty(Find("_repository.Get<Category>();"));
    }

    [Fact]
    public void Nesting_does_not_end_the_statement_early()
    {
        // A lambda body, an initialiser and a nested call all contain ')' or '}': reading the
        // statement by brace counting is what keeps the owner predicate inside the inspected text.
        var source = """
            _repository.Get<BudgetItem>()
                .Select(i => new { i.ItemId, i.UserId })
                .Where(x => x.ItemId > 0)
                .ToListAsync();
            """;

        Assert.Empty(Find(source));
    }

    [Fact]
    public void The_reported_line_points_at_the_read()
    {
        var source = "var x = 1;\nvar y = 2;\n_repository.GetTrack<Budget>();";

        var offender = Assert.Single(Find(source));
        Assert.Equal(3, offender.Line);
    }

    // --- The real corpus -------------------------------------------------------------------

    [Fact]
    public void No_business_layer_read_of_an_owned_entity_lacks_scoping()
    {
        var ownerBearing = OwnerBearingEntities();

        // Guards the guardrail: a scanner that found nothing because it looked in the wrong place
        // would otherwise pass silently over an empty set.
        Assert.True(
            ownerBearing.Count >= 11,
            $"Only {ownerBearing.Count} owner-bearing entities were derived from the model, so this probe is "
            + "probably inspecting the wrong model: " + string.Join(", ", ownerBearing.Order()));

        var servicesRoot = RepoLayout.Resolve("GastosApp.BusinessLogic", "Services");
        var files = Directory.GetFiles(servicesRoot, "*.cs", SearchOption.AllDirectories);
        Assert.NotEmpty(files);

        var readsInspected = 0;
        var offenders = new List<UnscopedRead>();

        foreach (var file in files)
        {
            var source = File.ReadAllText(file);
            var relative = Path.GetRelativePath(RepoLayout.Directory, file).Replace('\\', '/');

            readsInspected += ScopingGuardrailScanner.CountOwnerBearingReads(source, ownerBearing);
            offenders.AddRange(ScopingGuardrailScanner.FindUnscopedReads(relative, source, ownerBearing));
        }

        // The corpus was 76 reads when this guardrail was written. The floor only has to be low enough
        // to survive ordinary edits and high enough to notice a scanner that stopped matching.
        Assert.True(
            readsInspected >= 50,
            $"Only {readsInspected} owner-bearing reads were inspected, which means the scanner stopped finding "
            + "the call sites this probe exists to check.");

        Assert.True(
            offenders.Count == 0,
            "These reads of an owner-bearing entity neither filter by the owning user nor declare why they"
            + " do not have to. Either add the owner predicate, or justify it at the call site with the "
            + ScopingGuardrailScanner.ScopeByReferenceMarker + " marker:\n"
            + string.Join('\n', offenders.Select(o => $"  {o.File}:{o.Line}  [{o.Entity}]  {o.Statement}")));
    }

    // --- Helpers ---------------------------------------------------------------------------

    private static IReadOnlyList<UnscopedRead> Find(string source) =>
        ScopingGuardrailScanner.FindUnscopedReads("synthetic.cs", source, Owned);

    /// <summary>
    /// Derived from the EF model rather than hand-listed, so a new owned entity is covered the day it
    /// is mapped. The two identity tables are excluded by name: they are keyed by the user rather
    /// than owned by one, so an owner predicate is meaningless for them.
    /// </summary>
    private static IReadOnlySet<string> OwnerBearingEntities()
    {
        var options = new DbContextOptionsBuilder<ContextSqlGastos>()
            .UseNpgsql("Host=127.0.0.1;Port=1;Database=model-only;Username=none;Password=none;Timeout=1")
            .Options;

        using var context = new ContextSqlGastos(options, new AnonymousCurrentUser());

        return context.Model.GetEntityTypes()
            .Select(entity => entity.ClrType)
            .Where(type => type.GetProperty("UserId") is not null || type.GetProperty("OwnerUserId") is not null)
            .Select(type => type.Name)
            .Where(name => name is not ("User" or "UserSession"))
            .ToHashSet(StringComparer.Ordinal);
    }
}
