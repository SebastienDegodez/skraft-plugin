namespace SkraftTestHarness.Infrastructure.CopilotCli;

/// <summary>
/// A single, fully-formed invocation of the <c>copilot</c> executable:
/// the ordered command-line arguments and the working directory the
/// process should run in. Produced by <see cref="CopilotCliAgentRunner"/>
/// and consumed by an <see cref="ICopilotCliInvoker"/>.
/// </summary>
public sealed record CopilotCliInvocation(IReadOnlyList<string> Arguments, string? WorkingDirectory);
