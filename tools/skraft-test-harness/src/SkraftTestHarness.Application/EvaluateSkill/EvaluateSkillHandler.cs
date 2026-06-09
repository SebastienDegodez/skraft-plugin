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

    public EvaluateSkillHandler(IAgentRunner agentRunner, IJudge judge, IReporter reporter)
    {
        _agentRunner = agentRunner;
        _judge = judge;
        _reporter = reporter;
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
        var withSkillResult = await _agentRunner.RunAsync(scenario, RunMode.Isolated, cancellationToken);

        var baselineRun = new EvaluationRun(RunMode.Baseline, baselineResult.EvaluatedBy(scenario, WorkspaceView.Empty()));
        var withSkillRun = new EvaluationRun(RunMode.Isolated, withSkillResult.EvaluatedBy(scenario, WorkspaceView.Empty()));
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
}
