using SkraftTestHarness.Application.Gateways;
using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.Infrastructure.CopilotCli;

/// <summary>
/// <see cref="IAgentRunner"/> adapter that drives the real GitHub Copilot
/// CLI. It builds a non-interactive <c>copilot -p … --output-format json</c>
/// invocation from the scenario prompt and the <see cref="RunMode"/>,
/// delegates execution to an <see cref="ICopilotCliInvoker"/>, then parses
/// the JSONL transcript into an <see cref="AgentRunResult"/> via
/// <see cref="CopilotCliTranscript"/>.
///
/// Mode mapping: <see cref="RunMode.Baseline"/> loads no skill
/// (<c>--no-custom-instructions</c>); <see cref="RunMode.Isolated"/> and
/// <see cref="RunMode.Plugin"/> load the configured plugin directory and
/// custom agent so the agent runs "with the skill".
/// </summary>
public sealed class CopilotCliAgentRunner : IAgentRunner
{
    private readonly ICopilotCliInvoker _invoker;
    private readonly CopilotCliOptions _options;

    public CopilotCliAgentRunner(ICopilotCliInvoker invoker, CopilotCliOptions options)
    {
        _invoker = invoker ?? throw new ArgumentNullException(nameof(invoker));
        _options = options ?? throw new ArgumentNullException(nameof(options));
    }

    public async Task<AgentRunResult> RunAsync(Scenario scenario, RunMode mode, CancellationToken cancellationToken)
    {
        var invocation = BuildInvocation(scenario, mode);
        var stdout = await _invoker.InvokeAsync(invocation, cancellationToken);
        return CopilotCliTranscript.Parse(stdout);
    }

    private CopilotCliInvocation BuildInvocation(Scenario scenario, RunMode mode)
    {
        var args = new List<string>
        {
            "-p", ExtractPrompt(scenario),
            "--output-format", "json",
            "--allow-all-tools",
            "--no-ask-user",
            "--log-level", "error",
        };

        if (_options.Model is { Length: > 0 } model)
        {
            args.Add("--model");
            args.Add(model);
        }

        if (mode == RunMode.Baseline)
        {
            args.Add("--no-custom-instructions");
        }
        else
        {
            if (_options.PluginDirectory is { Length: > 0 } pluginDir)
            {
                args.Add("--plugin-dir");
                args.Add(pluginDir);
            }

            if (_options.AgentId is { Length: > 0 } agentId)
            {
                args.Add("--agent");
                args.Add(agentId);
            }
        }

        return new CopilotCliInvocation(args, _options.WorkingDirectory);
    }

    private static string ExtractPrompt(Scenario scenario)
    {
        var prompt = string.Empty;
        scenario.WithPrompt(p => prompt = p);
        return prompt;
    }
}
