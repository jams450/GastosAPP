namespace GastosApp.AI.Configuration;

public sealed class LlmOptions
{
    public const string SectionName = "Llm";

    public string BaseUrl { get; set; } = "";
    public string ApiKey { get; set; } = "";
    public string Model { get; set; } = "";

    /// <summary>
    /// Whether this configuration can actually reach a model. Single implementation on purpose: the
    /// placeholder rule used to be duplicated between the API layer and the client construction, so
    /// the two could disagree about what "configured" means.
    /// <para>
    /// Deliberately not a startup validation. A bad or unreachable LLM must never block the API from
    /// starting or the manual commands from working, so usability is decided at call time.
    /// </para>
    /// </summary>
    public bool IsUsable =>
        !IsPlaceholder(BaseUrl)
        && Uri.TryCreate(BaseUrl, UriKind.Absolute, out _)
        && !IsPlaceholder(ApiKey)
        && !IsPlaceholder(Model);

    /// <summary>A value that is absent or still holds a deployment placeholder such as <c>SET_FROM_ENV</c>.</summary>
    public static bool IsPlaceholder(string? value) =>
        string.IsNullOrWhiteSpace(value)
        || value.StartsWith("SET_", StringComparison.OrdinalIgnoreCase);
}
