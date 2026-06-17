namespace SkraftTestHarness.Infrastructure.CopilotCli;

/// <summary>
/// Seam over the <c>copilot</c> process: runs a prepared
/// <see cref="CopilotCliInvocation"/> and returns its raw stdout (the
/// JSONL transcript). The real implementation shells out; tests supply a
/// fake so the runner's argument-building and result-parsing can be
/// exercised without the CLI.
/// </summary>
public interface ICopilotCliInvoker
{
    Task<string> InvokeAsync(CopilotCliInvocation invocation, CancellationToken cancellationToken);
}
