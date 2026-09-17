namespace GastosApp.BusinessLogic.Models.CatalogRules
{
    /// <summary>
    /// Destino resuelto por una regla de categorización. Cuando la regla apunta a una
    /// subcategoría, <see cref="CategoryId"/> es la categoría padre derivada.
    /// </summary>
    public sealed record CatalogRuleResolution(int? CategoryId, int? SubcategoryId);
}
