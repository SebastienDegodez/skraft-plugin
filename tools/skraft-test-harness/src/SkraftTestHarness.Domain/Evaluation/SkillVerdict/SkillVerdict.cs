using SkraftTestHarness.Domain.Skills;

namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Aggregate root for a skill evaluation across one or more scenarios.
/// Holds the skill under evaluation and the per-scenario verdicts.
/// </summary>
public sealed class SkillVerdict
{
    private readonly SkillReference _skill;
    private readonly ScenarioVerdicts _scenarioVerdicts;

    public SkillVerdict(SkillReference skill, ScenarioVerdicts scenarioVerdicts)
    {
        _skill = skill ?? throw new ArgumentNullException(nameof(skill));
        _scenarioVerdicts = scenarioVerdicts ?? throw new ArgumentNullException(nameof(scenarioVerdicts));
    }

    /// <summary>
    /// Domain reconstitution factory for deserialization paths (e.g.
    /// loading JSON verdict files). Builds a minimal but correct
    /// <see cref="SkillVerdict"/> from the data persisted by
    /// <c>JsonReporter</c> — <c>name</c>, <c>winner</c>, <c>reason</c>
    /// per scenario. The placeholder <see cref="EvaluationRun"/> satisfies
    /// the <c>EvaluationRuns</c> ≥1 invariant without polluting the
    /// report tallies (only <c>JudgeDecision</c> is read during
    /// aggregation).
    /// </summary>
    internal static SkillVerdict Reconstitute(
        SkillReference skill,
        IEnumerable<(string name, Winner winner, string reason)> scenarios)
    {
        var verdicts = scenarios.Select(s =>
        {
            var scenario = Scenario.ForReconstitution(s.name);
            var decision = new JudgeDecision(s.winner, new JudgeReason(s.reason));
            var placeholderRun = new EvaluationRun(
                RunMode.Baseline,
                new ScenarioOutcome(new AgentOutput(string.Empty), new AssertionResults([])));
            var runs = new EvaluationRuns([placeholderRun]);
            var judgedRuns = new JudgedRuns(runs, decision);
            return new ScenarioVerdict(scenario, judgedRuns);
        }).ToList();

        return new SkillVerdict(skill, new ScenarioVerdicts(verdicts));
    }

    public bool IsFor(SkillReference skill) => _skill.Equals(skill);

    public bool CoversScenarioCount(int expected) => _scenarioVerdicts.Count() == expected;

    public bool CoversScenarioNamed(ScenarioName name) => _scenarioVerdicts.AnyFor(name);

    public bool WonByFor(ScenarioName name, Winner winner)
        => _scenarioVerdicts.WonByFor(name, winner);

    public bool AllWonBy(Winner winner) => _scenarioVerdicts.AllWonBy(winner);

    public bool HasReasonFor(ScenarioName name, JudgeReason reason)
        => _scenarioVerdicts.HasReasonFor(name, reason);

    public bool HasRunCountFor(ScenarioName name, int expected)
        => _scenarioVerdicts.HasRunCountFor(name, expected);

    public bool ContainsRunFor(ScenarioName name, RunMode mode, AgentOutput output)
        => _scenarioVerdicts.ContainsRunFor(name, mode, output);

    public void AccumulateTally(Action<SkillReference, Winner> onEntry)
        => _scenarioVerdicts.AccumulateWinners(w => onEntry(_skill, w));

    public void RenderTo(IVerdictRenderer renderer)
    {
        if (renderer is null) throw new ArgumentNullException(nameof(renderer));
        _skill.WithValue(renderer.OnSkill);
        _scenarioVerdicts.RenderTo(renderer);
    }
}
