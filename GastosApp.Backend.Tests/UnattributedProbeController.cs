using Microsoft.AspNetCore.Mvc;

namespace GastosApp.Backend.Tests;

/// <summary>
/// Test-only endpoint carrying no authorization metadata whatsoever, so the framework's default
/// policy is the only thing that can protect it.
/// <para>
/// It exists to prove the default is closed. An assertion about configuration would only show that a
/// policy object was built; this shows the real pipeline refusing an anonymous request.
/// </para>
/// <para>
/// It lives in the test assembly and is registered as an application part by
/// <see cref="UnattributedProbeFactory"/> only, so it never reaches the shipped application.
/// </para>
/// </summary>
[ApiController]
[Route("probe/unattributed")]
public sealed class UnattributedProbeController : ControllerBase
{
    [HttpGet]
    public IActionResult Get() => Ok(new { reachable = true });
}
