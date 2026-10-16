using GastosApp.BusinessLogic.Models.Budgets;
using GastosApp.BusinessLogic.Services;

namespace GastosApp.Dashboard.Tests;

/// <summary>
/// Regression for S11: the suggestion list must recognize the exact account/merchant match instead
/// of degrading it to a date-only weak coincidence. The service builds every suggestion pair through
/// <see cref="BudgetItemMatcher.CreateInput"/>, so dropping the transaction identity is exactly what
/// turns a strong exact match into just another weak "same month" candidate. No EF, no database, no
/// clock: the pair is the only variable.
/// </summary>
public static class BudgetSuggestionTests
{
    public static Task RunAsync()
    {
        var checks = 0;
        void Check(bool condition, string name)
        {
            if (!condition) throw new Exception($"FAIL {name}");
            checks++;
        }

        var plannedDate = new DateOnly(2026, 3, 20);
        var transactionDate = new DateOnly(2026, 3, 22);
        var itemOnAccount = new BudgetItemMatchInput
        {
            ItemId = 7,
            ItemKind = "expense",
            ItemCategoryId = 11,
            ItemAccountId = 42,
            PlannedAmount = 250.00m,
            PeriodKey = "2026-03",
            PlannedDate = plannedDate
        };
        var itemOnMerchant = itemOnAccount with { ItemId = 8, ItemAccountId = null, ItemMerchantId = 77 };

        // Exact account + scope + amount: the strong rule, which must win over "same month".
        var sameAccount = BudgetItemMatcher.CreateInput(
            itemOnAccount,
            transactionId: 501,
            transactionType: "expense",
            transactionCategoryId: 11,
            transactionSubcategoryId: null,
            transactionAccountId: 42,
            transactionMerchantId: null,
            transactionAmount: 250.00m,
            transactionLocalDate: transactionDate);
        Check(sameAccount.TransactionAccountId == 42 && sameAccount.TransactionMerchantId == null,
            "CreateInput keeps the transaction account identity");
        Check(BudgetItemMatcher.EvaluateStrength(sameAccount, 0m) == BudgetItemMatchStrength.Strong,
            "Exact account + scope + amount is recognized as strong, not a date-only weak");
        Check(BudgetItemMatcher.SelectWeak([sameAccount], 0m).Count == 0,
            "A strong exact match is not offered as a weak suggestion");

        // Same merchant + exact amount: the other strong branch.
        var sameMerchant = BudgetItemMatcher.CreateInput(
            itemOnMerchant,
            transactionId: 502,
            transactionType: "expense",
            transactionCategoryId: 11,
            transactionSubcategoryId: null,
            transactionAccountId: 99,
            transactionMerchantId: 77,
            transactionAmount: 250.00m,
            transactionLocalDate: transactionDate);
        Check(sameMerchant.TransactionMerchantId == 77,
            "CreateInput keeps the transaction merchant identity");
        Check(BudgetItemMatcher.EvaluateStrength(sameMerchant, 0m) == BudgetItemMatchStrength.Strong,
            "Exact merchant + amount is recognized as strong, not a date-only weak");
        Check(BudgetItemMatcher.SelectWeak([sameMerchant], 0m).Count == 0,
            "A strong merchant match is not offered as a weak suggestion");

        // Preserve: a genuine coincidence — same scope and month but a different account/amount —
        // must stay weak, which is what the suggestion list is for.
        var genuinelyWeak = BudgetItemMatcher.CreateInput(
            itemOnAccount,
            transactionId: 503,
            transactionType: "expense",
            transactionCategoryId: 11,
            transactionSubcategoryId: null,
            transactionAccountId: 99,
            transactionMerchantId: null,
            transactionAmount: 999.00m,
            transactionLocalDate: transactionDate);
        Check(BudgetItemMatcher.EvaluateStrength(genuinelyWeak, 0m) == BudgetItemMatchStrength.Weak,
            "A pair without matching identity stays weak");
        Check(BudgetItemMatcher.SelectWeak([genuinelyWeak], 0m).Count == 1,
            "A genuine weak coincidence remains suggested");

        Console.WriteLine($"PASS {checks} budget suggestion matching outcomes");
        return Task.CompletedTask;
    }

    /// <summary>
    /// S11 visible selection: an exact amount/account match that lands on a <b>later</b> date must
    /// outrank date-near weak candidates and stay in the suggestion list, and a genuine weak
    /// coincidence must still be offered when no stronger candidate exists. This drives the same
    /// <see cref="BudgetItemMatcher.SelectSuggestions"/> the service uses, not the pair factory.
    /// </summary>
    public static Task RunSelectionAsync()
    {
        var checks = 0;
        void Check(bool condition, string name)
        {
            if (!condition) throw new Exception($"FAIL {name}");
            checks++;
        }

        var plannedDate = new DateOnly(2026, 3, 10);
        var exactItem = new BudgetItemMatchInput
        {
            ItemId = 21,
            ItemKind = "expense",
            ItemCategoryId = 11,
            ItemAccountId = 42,
            PlannedAmount = 320.00m,
            PeriodKey = "2026-03",
            PlannedDate = plannedDate
        };
        var weakItem = exactItem with { ItemId = 22, ItemAccountId = 99 };

        // Exact account + scope + amount, but the transaction is 18 days later.
        var strongLater = BudgetItemMatcher.CreateInput(
            exactItem,
            transactionId: 601,
            transactionType: "expense",
            transactionCategoryId: 11,
            transactionSubcategoryId: null,
            transactionAccountId: 42,
            transactionMerchantId: null,
            transactionAmount: 320.00m,
            transactionLocalDate: new DateOnly(2026, 3, 28));

        // Same scope and month, different account and amount, only 1 day away: the noisy weak row.
        var weakNear = BudgetItemMatcher.CreateInput(
            weakItem,
            transactionId: 602,
            transactionType: "expense",
            transactionCategoryId: 11,
            transactionSubcategoryId: null,
            transactionAccountId: 77,
            transactionMerchantId: null,
            transactionAmount: 999.00m,
            transactionLocalDate: new DateOnly(2026, 3, 11));

        var selected = BudgetItemMatcher.SelectSuggestions([weakNear, strongLater], 0m);
        Check(selected.Count == 2,
            "The exact match and the weak coincidence are both visible");
        Check(selected[0].Input.TransactionId == 601 && selected[0].Strength == BudgetItemMatchStrength.Strong,
            "The exact account/amount match at a later date ranks first");
        Check(selected[1].Input.TransactionId == 602 && selected[1].Strength == BudgetItemMatchStrength.Weak,
            "The date-near weak coincidence stays visible behind the exact match");
        Check(selected[1].DistanceDays < selected[0].DistanceDays,
            "Ranking is by strength, not by date distance");

        var fallback = BudgetItemMatcher.SelectSuggestions([weakNear], 0m);
        Check(fallback.Count == 1 && fallback[0].Strength == BudgetItemMatchStrength.Weak,
            "Without a stronger candidate the genuine weak coincidence remains suggested");

        Console.WriteLine($"PASS {checks} budget suggestion selection outcomes");
        return Task.CompletedTask;
    }
}
