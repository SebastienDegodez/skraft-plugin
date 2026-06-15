namespace SkraftTestHarness.Infrastructure.CopilotCli;

/// <summary>
/// Configuration for <see cref="CopilotCliAgentRunner"/> that is constant
/// across scenarios: which plugin directory and custom agent to load when
/// running with the skill, the model to pin, and the working directory.
/// All members are optional — when null the corresponding CLI flag is
/// omitted.
/// </summary>
public sealed record CopilotCliOptions(
    string? PluginDirectory = null,
    string? AgentId = null,
    string? Model = null,
    string? WorkingDirectory = null);
