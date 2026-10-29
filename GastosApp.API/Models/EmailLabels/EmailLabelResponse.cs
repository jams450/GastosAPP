namespace GastosApp.API.Models.EmailLabels;

public class EmailLabelResponse
{
    public int LabelId { get; set; }
    public int UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string Kind { get; set; } = string.Empty;
    public string Behavior { get; set; } = string.Empty;
    public string? Color { get; set; }
    public bool IsSystem { get; set; }
    public int SortOrder { get; set; }
    public bool Active { get; set; }
}
