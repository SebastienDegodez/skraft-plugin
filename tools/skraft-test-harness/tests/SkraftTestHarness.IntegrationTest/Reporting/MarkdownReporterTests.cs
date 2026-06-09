using Microsoft.Extensions.Time.Testing;
using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Domain.Skills;
using SkraftTestHarness.Infrastructure.Reporting;
using SkraftTestHarness.IntegrationTest.Cli;

namespace SkraftTestHarness.IntegrationTest.Reporting;

/// <summary>
/// Integration tests for <see cref="MarkdownReporter"/>: it should write a real
/// Markdown file inside the configured <see cref="ReportTarget"/> directory
/// when <c>EmitAsync</c> is called with a <see cref="SkillVerdict"/>.
/// </summary>
public sealed class MarkdownReporterTests
{
    [Test]
    public async Task ShouldWriteMarkdownFileWithSkillNameHeading()
    {
        using var workspace = new TempWorkspace();
        var clock = new FakeTimeProvider();
        clock.SetUtcNow(new DateTimeOffset(2026, 3, 1, 12, 0, 0, TimeSpan.Zero));
        var reporter = new MarkdownReporter(ReportTarget.Directory(workspace.Path), clock);
        var verdict = BuildVerdict("outside-in-tdd", "Echo scenario", Winner.WithSkill, "skill clarifies intent");

        await reporter.EmitAsync(verdict, CancellationToken.None);

        var files = Directory.GetFiles(workspace.Path, "*.md");
        await Assert.That(files.Length).IsEqualTo(1);
        var content = await File.ReadAllTextAsync(files[0]);
        await Assert.That(content).Contains("# ");
        await Assert.That(files[0]).EndsWith(".md");
    }

    [Test]
    public async Task ShouldIncludeScenarioOutcomesInMarkdown()
    {
        using var workspace = new TempWorkspace();
        var clock = new FakeTimeProvider();
        clock.SetUtcNow(new DateTimeOffset(2026, 3, 1, 12, 0, 0, TimeSpan.Zero));
        var reporter = new MarkdownReporter(ReportTarget.Directory(workspace.Path), clock);
        var verdict = BuildVerdict("outside-in-tdd", "Echo scenario", Winner.WithSkill, "skill clarifies intent");

        await reporter.EmitAsync(verdict, CancellationToken.None);

        var files = Directory.GetFiles(workspace.Path, "*.md");
        var content = await File.ReadAllTextAsync(files[0]);
        await Assert.That(content).Contains("Echo scenario");
    }

    private static SkillVerdict BuildVerdict(string skillId, string scenarioName, Winner winner, string reason)
        => BuildVerdict(skillId, [(scenarioName, winner, reason)]);

    private static SkillVerdict BuildVerdict(string skillId, (string name, Winner winner, string reason)[] scenarios)
    {
        var verdicts = scenarios.Select(s =>
        {
            var scenario = Scenario.Create(
                name: s.name,
                prompt: "prompt",
                assertions: [new OutputContains(new Needle("x"))]);
            var baselineRun = new EvaluationRun(
                RunMode.Baseline,
                AgentRunResult.OutputOnly(new AgentOutput("baseline")).EvaluatedBy(scenario, WorkspaceView.Empty()));
            var withSkillRun = new EvaluationRun(
                RunMode.Isolated,
                AgentRunResult.OutputOnly(new AgentOutput("with-skill")).EvaluatedBy(scenario, WorkspaceView.Empty()));
            var decision = new JudgeDecision(s.winner, new JudgeReason(s.reason));
            return new ScenarioVerdict(
                scenario,
                new JudgedRuns(new EvaluationRuns([baselineRun, withSkillRun]), decision));
        }).ToList();

        return new SkillVerdict(new SkillReference(skillId), new ScenarioVerdicts(verdicts));
    }
}
