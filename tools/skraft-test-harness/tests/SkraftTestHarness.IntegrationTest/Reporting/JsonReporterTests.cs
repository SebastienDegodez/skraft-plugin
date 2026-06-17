using System.Text.Json;
using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Domain.Skills;
using SkraftTestHarness.IntegrationTest.Cli;
using SkraftTestHarness.Infrastructure.Reporting;

namespace SkraftTestHarness.IntegrationTest.Reporting;

/// <summary>
/// Integration tests for <see cref="JsonReporter"/>: it writes a real
/// JSON file inside the configured <see cref="ReportTarget"/> directory
/// when the <c>EvaluateSkill</c> use case emits a verdict.
/// </summary>
public sealed class JsonReporterTests
{
    [Test]
    public async Task EmitAsync_ShouldWriteJsonFileNamedAfterSkillAndUtcTimestamp()
    {
        using var workspace = new TempWorkspace();
        var reporter = new JsonReporter(ReportTarget.Directory(workspace.Path), TimeProvider.System);

        var verdict = BuildVerdict("outside-in-tdd", "Echo scenario", Winner.WithSkill, "skill clarifies intent");

        await reporter.EmitAsync(verdict, CancellationToken.None);

        var files = Directory.GetFiles(workspace.Path, "*.json");
        await Assert.That(files.Length).IsEqualTo(1);

        var fileName = Path.GetFileName(files[0]);
        await Assert.That(fileName).StartsWith("outside-in-tdd-");
        await Assert.That(fileName).EndsWith("Z.json");
        await Assert.That(fileName).DoesNotContain(":");

        var content = await File.ReadAllTextAsync(files[0]);
        using var doc = JsonDocument.Parse(content);
        await Assert.That(doc.RootElement.GetProperty("skill").GetString()).IsEqualTo("outside-in-tdd");

        var scenarios = doc.RootElement.GetProperty("scenarios");
        await Assert.That(scenarios.GetArrayLength()).IsEqualTo(1);
        await Assert.That(scenarios[0].GetProperty("name").GetString()).IsEqualTo("Echo scenario");
        await Assert.That(scenarios[0].GetProperty("winner").GetString()).IsEqualTo("WithSkill");
        await Assert.That(scenarios[0].GetProperty("reason").GetString()).IsEqualTo("skill clarifies intent");
    }

    [Test]
    public async Task EmitAsync_ShouldSerialiseEveryScenarioVerdict()
    {
        using var workspace = new TempWorkspace();
        var reporter = new JsonReporter(ReportTarget.Directory(workspace.Path), TimeProvider.System);

        var verdict = BuildVerdict(
            "outside-in-tdd",
            [("Echo scenario", Winner.WithSkill, "first"), ("Greet scenario", Winner.Baseline, "second")]);

        await reporter.EmitAsync(verdict, CancellationToken.None);

        var path = Directory.GetFiles(workspace.Path, "*.json").Single();
        using var doc = JsonDocument.Parse(await File.ReadAllTextAsync(path));
        var names = doc.RootElement.GetProperty("scenarios").EnumerateArray()
            .Select(e => e.GetProperty("name").GetString())
            .ToArray();
        await Assert.That(names).Contains("Echo scenario");
        await Assert.That(names).Contains("Greet scenario");
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
