using GastosApp.BusinessLogic.Interfaces;

namespace GastosApp.Backend.Tests;

/// <summary>
/// A current-user service that reports nobody, for probes that only need a context to exist.
/// Constructing a <c>DbContext</c> does not open a connection, so this keeps such probes offline.
/// </summary>
internal sealed class AnonymousCurrentUser : ICurrentUserService
{
    public int? GetUserId() => null;

    public int GetRequiredUserId() => throw new UnauthorizedAccessException("No user.");

    public int? GetSessionVersion() => null;

    public Guid? GetSessionId() => null;

    public string GetName() => "System";

    public string GetEmail() => "System";

    public bool IsAdmin() => false;
}
