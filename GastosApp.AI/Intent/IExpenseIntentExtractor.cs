namespace GastosApp.AI.Intent;

public interface IExpenseIntentExtractor
{
    Task<IntentResult> ExtractAsync(IntentRequest request, CancellationToken cancellationToken);
}
