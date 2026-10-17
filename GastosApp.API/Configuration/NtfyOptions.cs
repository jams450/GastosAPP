namespace GastosApp.API.Configuration;

public sealed class NtfyOptions
{
    public const string SectionName = "Ntfy";
    public bool Enabled { get; set; }
    public string Server { get; set; } = "https://ntfy.amitzi.xyz/";
    public string Topic { get; set; } = "GastosApp";
    public string Token { get; set; } = string.Empty;

    public bool HasSafeEndpoint() =>
        Uri.TryCreate(Server, UriKind.Absolute, out var uri) &&
        uri.Scheme == Uri.UriSchemeHttps &&
        string.IsNullOrEmpty(uri.UserInfo) &&
        string.IsNullOrEmpty(uri.Query) &&
        string.IsNullOrEmpty(uri.Fragment) &&
        !string.IsNullOrWhiteSpace(Topic) &&
        Topic.All(c => char.IsAsciiLetterOrDigit(c) || c is '_' or '-');

    public bool HasToken() => !string.IsNullOrWhiteSpace(Token) &&
        !Token.StartsWith("SET_", StringComparison.OrdinalIgnoreCase) &&
        !Token.Any(char.IsWhiteSpace);
}
