namespace GastosApp.BusinessLogic.Exceptions
{
    /// <summary>
    /// Conflicto de dominio sobre una partida planificada: la operación es válida en general
    /// pero el estado actual la impide (periodo cerrado, partida cancelada). El API lo traduce
    /// a 409 para no confundirlo con una entrada inválida (400).
    /// </summary>
    public sealed class BudgetConflictException : Exception
    {
        public BudgetConflictException(string message) : base(message)
        {
        }
    }
}
