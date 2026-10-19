using System.Text.RegularExpressions;

namespace GastosApp.Backend.Tests;

/// <summary>One read of an owner-bearing entity that carries no evidence of owner scoping.</summary>
public sealed record UnscopedRead(string File, int Line, string Entity, string Statement);

/// <summary>
/// Finds reads of owner-bearing entities whose whole statement neither filters by the owning user
/// nor declares why it does not have to.
/// <para>
/// The unit of inspection is the <b>whole statement</b>, not the <c>Get&lt;T&gt;()</c> argument,
/// because the owner predicate is usually in the fluent chain that follows the call
/// (<c>_repository.GetTrack&lt;BudgetItem&gt;().Where(i =&gt; i.UserId == userId)</c>). Measuring only
/// the argument reported 27 offenders where there are 7.
/// </para>
/// <para>
/// A read that is legitimately scoped by a reference — a foreign key whose parent was already
/// resolved for this user — declares that at the call site with
/// <see cref="ScopeByReferenceMarker"/>. Keeping the justification next to the code instead of in a
/// list of line numbers means moving the statement cannot silently invalidate it, and reviewing the
/// justification is part of reviewing the diff.
/// </para>
/// </summary>
public static class ScopingGuardrailScanner
{
    /// <summary>Marker that exempts a statement, followed by the reason on the same statement.</summary>
    public const string ScopeByReferenceMarker = "alcance-por-referencia:";

    private static readonly Regex ReadCall = new(
        @"_repository\.(?:Get|GetTrack)<(?<entity>\w+)>\(",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    /// <summary>
    /// <c>GetTrack&lt;T&gt;().AddRange(...)</c> is the idiom for "give me the set to write into", not a read.
    /// The write is scoped by whatever the caller puts in <c>T.UserId</c>, so demanding an owner
    /// predicate here would ask for something meaningless and teach people to ignore the guardrail.
    /// </summary>
    private static readonly Regex WriteOnlyChain = new(
        @"^_repository\.(?:Get|GetTrack)<\w+>\(\)\s*\.\s*(?:Add|AddRange|Remove|RemoveRange)\b",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public static IReadOnlyList<UnscopedRead> FindUnscopedReads(
        string file,
        string source,
        IReadOnlySet<string> ownerBearingEntities)
    {
        ArgumentNullException.ThrowIfNull(source);
        ArgumentNullException.ThrowIfNull(ownerBearingEntities);

        var offenders = new List<UnscopedRead>();

        foreach (Match match in ReadCall.Matches(source))
        {
            var entity = match.Groups["entity"].Value;
            if (!ownerBearingEntities.Contains(entity))
            {
                continue;
            }

            var statement = ReadStatement(source, match.Index);
            if (WriteOnlyChain.IsMatch(statement))
            {
                continue;
            }

            if (MentionsOwner(statement) || MentionsMarker(statement))
            {
                continue;
            }

            offenders.Add(new UnscopedRead(file, LineOf(source, match.Index), entity, Condense(statement)));
        }

        return offenders;
    }

    /// <summary>Every read of an owner-bearing entity, so a probe can prove it inspected a real corpus.</summary>
    public static int CountOwnerBearingReads(string source, IReadOnlySet<string> ownerBearingEntities) =>
        ReadCall.Matches(source).Count(m => ownerBearingEntities.Contains(m.Groups["entity"].Value));

    /// <summary>
    /// From the call to the <c>;</c> that closes its statement, tracking nesting so a lambda body or a
    /// nested initialiser cannot end it early, plus the rest of the terminating line.
    /// <para>
    /// The trailing line matters: a justification marker belongs at the end of the statement it
    /// exempts, which puts it after the <c>;</c> and therefore outside the statement proper.
    /// </para>
    /// </summary>
    private static string ReadStatement(string source, int start)
    {
        var depth = 0;
        var terminator = -1;

        for (var i = start; i < source.Length; i++)
        {
            switch (source[i])
            {
                case '(' or '[' or '{':
                    depth++;
                    continue;
                case ')' or ']' or '}':
                    depth--;
                    continue;
                case ';' when depth == 0:
                    terminator = i;
                    break;
                default:
                    continue;
            }

            break;
        }

        if (terminator < 0)
        {
            return source[start..];
        }

        var lineEnd = source.IndexOf('\n', terminator);
        return source[start..(lineEnd < 0 ? source.Length : lineEnd)];
    }

    private static bool MentionsOwner(string statement) =>
        statement.Contains("UserId", StringComparison.Ordinal);

    private static bool MentionsMarker(string statement) =>
        statement.Contains(ScopeByReferenceMarker, StringComparison.Ordinal);

    private static int LineOf(string source, int index)
    {
        var line = 1;

        for (var i = 0; i < index && i < source.Length; i++)
        {
            if (source[i] == '\n')
            {
                line++;
            }
        }

        return line;
    }

    private static string Condense(string statement) =>
        string.Join(' ', statement.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
}
