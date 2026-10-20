namespace GastosApp.API.Models.Transactions;

public class TransactionResponse
{
    public int TransactionId { get; set; }
    public int AccountId { get; set; }
    public int? CategoryId { get; set; }
    public int? SubcategoryId { get; set; }
    public int? MerchantId { get; set; }
    public string Type { get; set; } = string.Empty;
    public Guid? TransferGroupId { get; set; }
    public decimal Amount { get; set; }
    public decimal BalanceImpact { get; set; }
    public string? Direction { get; set; }
    public int? CounterpartyAccountId { get; set; }
    public string? Description { get; set; }
    public DateTime TransactionDate { get; set; }
    /// <summary>Verdadero cuando el ingreso es rendimiento de una cuenta que devenga interés.</summary>
    public bool IsInterest { get; set; }

    /// <summary>Divisa en que se capturó el movimiento.</summary>
    public string CurrencyCode { get; set; } = "MXN";

    /// <summary>
    /// Tasa congelada en el movimiento. En la divisa base se expone <c>1</c> aunque la tabla guarde
    /// <c>null</c>: la base no se convierte contra sí misma, pero el contrato queda uniforme y ningún
    /// consumidor necesita un caso especial.
    /// </summary>
    public decimal FxRate { get; set; } = 1m;

    /// <summary>Fecha de publicación de la tasa usada. Nula en la divisa base.</summary>
    public DateOnly? FxRateDate { get; set; }

    /// <summary>
    /// Importe consolidado en la divisa base. Es el que suman saldos, plan, presupuestos y tablero;
    /// <see cref="Amount"/> conserva el importe original en su divisa.
    /// </summary>
    public decimal AmountMxn { get; set; }
    public IEnumerable<string> Tags { get; set; } = Array.Empty<string>();
    public IEnumerable<TransactionAllocationResponse> Allocations { get; set; } = Array.Empty<TransactionAllocationResponse>();
}
