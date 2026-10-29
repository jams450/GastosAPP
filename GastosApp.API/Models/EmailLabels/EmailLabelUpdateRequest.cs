namespace GastosApp.API.Models.EmailLabels;

public class EmailLabelUpdateRequest
{
    public string Name { get; set; } = string.Empty;

    public string? Slug { get; set; }

    public string Kind { get; set; } = "folder";

    public string Behavior { get; set; } = "none";

    public string? Color { get; set; }

    public int SortOrder { get; set; }

    public bool Active { get; set; } = true;
}
