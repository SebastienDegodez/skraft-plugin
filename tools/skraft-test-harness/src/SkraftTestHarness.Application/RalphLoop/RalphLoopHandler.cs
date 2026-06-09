using SkraftTestHarness.Application.ConsolidateResults;
using SkraftTestHarness.Application.EvaluateSkill;
using SkraftTestHarness.Application.Gateways;
using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.Application.RalphLoop;

/// <summary>
/// Application use case: runs <see cref="EvaluateSkillHandler"/> N times,
/// consolidates all <see cref="SkillVerdict"/>s into a single
/// <see cref="AggregateReport"/>, computes the
/// <see cref="ImprovementScore"/> via
/// <see cref="WinnerTally.ComputeImprovementScore()"/>, and checks the
/// optional threshold gate.
/// </summary>
public sealed class RalphLoopHandler
{
    private readonly IAgentRunner _agentRunner;
    private readonly IJudge _judge;
    private readonly IScenarioLoader _scenarioLoader;
    private readonly IReporter _reporter;

    public RalphLoopHandler(
        IAgentRunner agentRunner,
        IJudge judge,
        IScenarioLoader scenarioLoader,
        IReporter reporter)
    {
        _agentRunner = agentRunner;
        _judge = judge;
        _scenarioLoader = scenarioLoader;
        _reporter = reporter;
    }

    public async Task<(AggregateReport Report, bool ThresholdPassed)> Handle(
        RalphLoopCommand command,
        CancellationToken cancellationToken)
    {
        var scenarios = await _scenarioLoader.LoadAsync(command.TestsDir, cancellationToken);
        var evaluateHandler = new EvaluateSkillHandler(_agentRunner, _judge, _reporter);
        var evalCommand = new EvaluateSkillCommand(command.Skill, scenarios);

        var verdicts = new List<SkillVerdict>(command.Runs);
        for (var i = 0; i < command.Runs; i++)
        {
            var verdict = await evaluateHandler.Handle(evalCommand, cancellationToken);
            verdicts.Add(verdict);
        }

        var consolidateHandler = new ConsolidateResultsHandler();
        var report = await consolidateHandler.Handle(
            new ConsolidateResultsCommand(verdicts), cancellationToken);

        var score = report.ComputeImprovementScore();
        var thresholdPassed = command.Threshold is null || score.IsAbove(command.Threshold.Value);

        return (report, thresholdPassed);
    }
}
