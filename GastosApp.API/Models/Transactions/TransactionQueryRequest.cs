using System.ComponentModel.DataAnnotations;

namespace GastosApp.API.Models.Transactions;

public class TransactionQueryRequest : IValidatableObject
{
    // Page is capped so the EF Core Skip offset remains within Int32 range at the maximum page size.
    [Range(1, 21_474_837)]
    public int Page { get; set; } = 1;

    [Range(1, 100)]
    public int PageSize { get; set; } = 50;

    public DateTimeOffset? StartDate { get; set; }

    // Exact timestamps are inclusive by default. Set IncludeEndDay to include the complete calendar day in the supplied offset.
    public DateTimeOffset? EndDate { get; set; }

    /// <summary>
    /// Expands EndDate to the final tick of its calendar day in the supplied offset. Defaults to false so EndDate remains exact.
    /// </summary>
    public bool IncludeEndDay { get; set; }

    [Range(1, int.MaxValue)]
    public int? CategoryId { get; set; }
    [Range(1, int.MaxValue)]
    public int? SubcategoryId { get; set; }
    [Range(1, int.MaxValue)]
    public int? MerchantId { get; set; }
    public string? Type { get; set; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (Type is not null && !new[] { "income", "expense", "transfer", "opening_credit" }.Contains(Type, StringComparer.OrdinalIgnoreCase))
        {
            yield return new ValidationResult("Type is invalid.", [nameof(Type)]);
        }
    }
}

public class TransactionQueryResponse
{
    public int Page { get; set; }
    public int PageSize { get; set; }
    public int TotalCount { get; set; }
    public IEnumerable<TransactionResponse> Items { get; set; } = [];
}
