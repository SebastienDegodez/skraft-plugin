using Microsoft.Extensions.Time.Testing;
using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Domain.Skills;
using SkraftTestHarness.IntegrationTest.Cli;
using SkraftTestHarness.Infrastructure.Reporting;

namespace SkraftTestHarness.IntegrationTest.Reporting;

/// <summary>
/// Integration tests pinning <see cref="JsonReporter"/>'s dependency on
/// the <see cref="IClock"/> gateway: filename timestamps must come from
/// the injected clock, never <see cref="DateTimeOffset.UtcNow"/>, so the
/// reporter is deterministic under test.
/// </summary>
public sealed class JsonReporterClockTests
{
    [Test]
    public async Task ShouldUseTheInjectedClockForTheFilenameTimestamp()
    {
        using var workspace = new TempWorkspace();
        var clock = new FakeTimeProvider();
        clock.SetUtcNow(new DateTimeOffset(2026, 1, 2, 3, 4, 5, TimeSpan.Zero));

        var reporter = new JsonReporter(ReportTarget.Directory(workspace.Path), clock);

        var verdict = BuildVerdict("outside-in-tdd", "Echo scenario", Winner.WithSkill, "skill clarifies intent");

        await reporter.EmitAsync(verdict, CancellationToken.None);

        var files = Directory.GetFiles(workspace.Path, "*.json");
        await Assert.That(files.Length).IsEqualTo(1);

        var fileName = Path.GetFileName(files[0]);
        await Assert.That(fileName).IsEqualTo("outside-in-tdd-2026-01-02T030405Z.json");
    }

    private static SkillVerdict BuildVerdict(string skillId, string scenarioName, Winner winner, string reason)
    {
        var scenario = Scenario.Create(
            name: scenarioName,
            prompt: "prompt",
            assertions: [new OutputContains(new Needle("x"))]);
        var baselineRun = new EvaluationRun(
            RunMode.Baseline,
            AgentRunResult.OutputOnly(new AgentOutput("baseline")).EvaluatedBy(scenario, WorkspaceView.Empty()));
        var withSkillRun = new EvaluationRun(
            RunMode.Isolated,
            AgentRunResult.OutputOnly(new AgentOutput("with-skill")).EvaluatedBy(scenario, WorkspaceView.Empty()));
        var decision = new JudgeDecision(winner, new JudgeReason(reason));
        var verdicts = new List<ScenarioVerdict>
        {
            new(scenario, new JudgedRuns(new EvaluationRuns([baselineRun, withSkillRun]), decision)),
        };
        return new SkillVerdict(new SkillReference(skillId), new ScenarioVerdicts(verdicts));
    }
}
