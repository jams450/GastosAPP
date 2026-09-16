namespace GastosApp.AI.Configuration;

public sealed class LlmOptions
{
    public const string SectionName = "Llm";

    public string BaseUrl { get; set; } = "";
    public string ApiKey { get; set; } = "";
    public string Model { get; set; } = "";
}
