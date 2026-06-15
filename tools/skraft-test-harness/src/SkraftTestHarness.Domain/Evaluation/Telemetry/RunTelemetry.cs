namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// What a single agent run cost and which model answered it: the model
/// name, the output tokens produced, the AIC (premium requests)
/// consumed, and how many subagents and skills the run invoked. Each
/// value is optional; a null means the Copilot CLI did not provide it
/// (input tokens, for instance, are never emitted).
/// </summary>
public sealed class RunTelemetry
{
    private readonly string? _model;
    private readonly long? _outputTokens;
    private readonly long? _premiumRequests;
    private readonly long? _agentsInvoked;
    private readonly long? _skillsInvoked;

    public RunTelemetry(
        string? model,
        long? outputTokens,
        long? premiumRequests,
        long? agentsInvoked = null,
        long? skillsInvoked = null)
    {
        _model = model;
        _outputTokens = outputTokens;
        _premiumRequests = premiumRequests;
        _agentsInvoked = agentsInvoked;
        _skillsInvoked = skillsInvoked;
    }

    public static RunTelemetry None() => new(null, null, null);

    public void WithModel(Action<string?> use) => use(_model);

    public void WithOutputTokens(Action<long?> use) => use(_outputTokens);

    public void WithPremiumRequests(Action<long?> use) => use(_premiumRequests);

    public void WithAgentsInvoked(Action<long?> use) => use(_agentsInvoked);

    public void WithSkillsInvoked(Action<long?> use) => use(_skillsInvoked);
}
