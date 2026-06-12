using SkraftTestHarness.Application.Gateways;
using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.Application.EvaluateSkill;

/// <summary>
/// Application use case: runs one scenario twice (baseline + isolated
/// with the target skill), then asks the pairwise judge which output
/// is better. Produces a <see cref="SkillVerdict"/>.
/// </summary>
public sealed class EvaluateSkillHandler
{
    private readonly IAgentRunner _agentRunner;
    private readonly IJudge _judge;
    private readonly IReporter _reporter;
    private readonly IWorkspaceProbe _workspaceProbe;
    private readonly IAssertionJudge _assertionJudge;

    public EvaluateSkillHandler(IAgentRunner agentRunner, IJudge judge, IReporter reporter)
        : this(agentRunner, judge, reporter, new NullWorkspaceProbe(), new NullAssertionJudge())
    {
    }

    public EvaluateSkillHandler(
        IAgentRunner agentRunner,
        IJudge judge,
        IReporter reporter,
        IWorkspaceProbe workspaceProbe,
        IAssertionJudge assertionJudge)
    {
        _agentRunner = agentRunner ?? throw new ArgumentNullException(nameof(agentRunner));
        _judge = judge ?? throw new ArgumentNullException(nameof(judge));
        _reporter = reporter ?? throw new ArgumentNullException(nameof(reporter));
        _workspaceProbe = workspaceProbe ?? throw new ArgumentNullException(nameof(workspaceProbe));
        _assertionJudge = assertionJudge ?? throw new ArgumentNullException(nameof(assertionJudge));
    }

    public async Task<SkillVerdict> Handle(EvaluateSkillCommand command, CancellationToken cancellationToken)
    {
        var scenarioVerdicts = await command.Scenarios.EvaluateEachAsync(scenario =>
            EvaluateOneScenario(scenario, cancellationToken));

        var verdict = new SkillVerdict(command.Skill, scenarioVerdicts);
        await _reporter.EmitAsync(verdict, cancellationToken);
        return verdict;
    }

    private async Task<ScenarioVerdict> EvaluateOneScenario(Scenario scenario, CancellationToken cancellationToken)
    {
        var baselineResult = await _agentRunner.RunAsync(scenario, RunMode.Baseline, cancellationToken);
        var baselineView = await BuildWorkspaceView(scenario, baselineResult, cancellationToken);

        var withSkillResult = await _agentRunner.RunAsync(scenario, RunMode.Isolated, cancellationToken);
        var withSkillView = await BuildWorkspaceView(scenario, withSkillResult, cancellationToken);

        var baselineRun = new EvaluationRun(RunMode.Baseline, baselineResult.EvaluatedBy(scenario, baselineView));
        var withSkillRun = new EvaluationRun(RunMode.Isolated, withSkillResult.EvaluatedBy(scenario, withSkillView));
        var runs = new EvaluationRuns([baselineRun, withSkillRun]);

        Winner assertionWinner = Winner.Tie;
        runs.DetermineAssertionWinner(w => assertionWinner = w);

        JudgeDecision decision;
        if (assertionWinner == Winner.Tie)
            decision = await _judge.CompareAsync(baselineResult.Output(), withSkillResult.Output(), cancellationToken);
        else
            decision = JudgeDecision.FromAssertions(assertionWinner);

        return new ScenarioVerdict(
            scenario,
            new JudgedRuns(runs, decision));
    }

    private Task<WorkspaceView> BuildWorkspaceView(
        Scenario scenario, AgentRunResult runResult, CancellationToken cancellationToken)
        => scenario.CollectProbeRequests().ResolveWith(
            _workspaceProbe.Exists,
            _workspaceProbe.AnyMatches,
            _workspaceProbe.AnyMatchContains,
            (pattern, criterion) => _assertionJudge.JudgeFilesAsync(pattern, criterion, cancellationToken),
            criterion => _assertionJudge.JudgeOutputAsync(runResult.Output(), criterion, cancellationToken));

    /// <summary>No workspace available: every file probe resolves to absent.</summary>
    private sealed class NullWorkspaceProbe : IWorkspaceProbe
    {
        public bool Exists(FilePath path) => false;

        public bool AnyMatches(GlobPattern pattern) => false;

        public bool AnyMatchContains(GlobPattern pattern, Needle needle) => false;
    }

    /// <summary>No judge available: every judgement resolves to failed (never a silent pass).</summary>
    private sealed class NullAssertionJudge : IAssertionJudge
    {
        public Task<bool> JudgeFilesAsync(GlobPattern pattern, Criterion criterion, CancellationToken cancellationToken)
            => Task.FromResult(false);

        public Task<bool> JudgeOutputAsync(AgentOutput output, Criterion criterion, CancellationToken cancellationToken)
            => Task.FromResult(false);
    }
}
