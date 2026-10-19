namespace GastosApp.Backend.Tests;

/// <summary>
/// Locates the repository root so tests can read files that are not part of any assembly
/// (<c>SQL/migrations</c>, <c>scripts/</c>). Walking up for <c>code.sln</c> keeps the tests
/// independent of the working directory `dotnet test` happens to use.
/// </summary>
internal static class RepoLayout
{
    public static string Directory { get; } = Locate();

    public static string Resolve(params string[] relativeSegments) =>
        Path.Combine([Directory, .. relativeSegments]);

    private static string Locate()
    {
        var candidate = new DirectoryInfo(AppContext.BaseDirectory);

        while (candidate is not null)
        {
            if (File.Exists(Path.Combine(candidate.FullName, "code.sln")))
            {
                return candidate.FullName;
            }

            candidate = candidate.Parent;
        }

        throw new InvalidOperationException(
            $"Could not locate the repository root (a directory containing code.sln) above {AppContext.BaseDirectory}.");
    }
}
