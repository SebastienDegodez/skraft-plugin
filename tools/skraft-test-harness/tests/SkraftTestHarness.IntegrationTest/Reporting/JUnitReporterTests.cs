using System.Xml.Linq;
using Microsoft.Extensions.Time.Testing;
using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Domain.Skills;
using SkraftTestHarness.Infrastructure.Reporting;
using SkraftTestHarness.IntegrationTest.Cli;

namespace SkraftTestHarness.IntegrationTest.Reporting;

/// <summary>
/// RED slice for <see cref="JUnitReporter"/>: both tests drive the
/// contract that <c>EmitAsync</c> writes a JUnit-compatible XML file
/// with a <c>&lt;testsuite&gt;</c> root and one <c>&lt;testcase&gt;</c>
/// per <see cref="ScenarioVerdict"/>.
/// </summary>
public sealed class JUnitReporterTests
{
    [Test]
    public async Task ShouldWriteJUnitXmlWithTestsuiteRoot()
    {
        using var workspace = new TempWorkspace();
        var clock = new FakeTimeProvider();
        clock.SetUtcNow(new DateTimeOffset(2026, 3, 1, 12, 0, 0, TimeSpan.Zero));
        var reporter = new JUnitReporter(ReportTarget.Directory(workspace.Path), clock);
        var verdict = BuildVerdict("outside-in-tdd", "Echo scenario", Winner.WithSkill, "skill clarifies intent");

        await reporter.EmitAsync(verdict, CancellationToken.None);

        var files = Directory.GetFiles(workspace.Path, "*.xml");
        await Assert.That(files).Count().IsEqualTo(1);
        var xml = XDocument.Load(files[0]);
        await Assert.That(xml.Root!.Name.LocalName).IsEqualTo("testsuite");
    }

    [Test]
    public async Task ShouldIncludeOneTestcasePerScenario()
    {
        using var workspace = new TempWorkspace();
        var clock = new FakeTimeProvider();
        clock.SetUtcNow(new DateTimeOffset(2026, 3, 1, 12, 0, 0, TimeSpan.Zero));
        var reporter = new JUnitReporter(ReportTarget.Directory(workspace.Path), clock);
        var verdict = BuildVerdict(
            "outside-in-tdd",
            [("Echo scenario", Winner.WithSkill, "first"), ("Greet scenario", Winner.Baseline, "second")]);

        await reporter.EmitAsync(verdict, CancellationToken.None);

        var files = Directory.GetFiles(workspace.Path, "*.xml");
        var xml = XDocument.Load(files[0]);
        await Assert.That(xml.Root!.Elements("testcase").Count()).IsEqualTo(2);
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
