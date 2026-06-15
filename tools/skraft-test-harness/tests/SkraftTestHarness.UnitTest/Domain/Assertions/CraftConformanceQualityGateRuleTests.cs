using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Infrastructure.Yaml;

namespace SkraftTestHarness.UnitTest.Domain.Assertions;

/// <summary>
/// The <c>quality_gate</c> craft-rule kind proves a quality gate (e.g.
/// mutation testing) actually passed — by reading the structured
/// evidence log the software-engineer produced
/// (<c>quality-gates-evidence-contract</c>, <c>qg-*.json</c>) and
/// checking the named gate's status, NOT by trusting prose. Falsifiable
/// from the produced tree alone.
/// </summary>
public sealed class CraftConformanceQualityGateRuleTests
{
    private const string Yaml = """
        scenarios:
          - name: "Deliver phase"
            prompt: "Run DELIVER."
            assertions:
              - craft_conformance:
                  rules:
                    - id: mutation-gate-passed
                      quality_gate:
                        evidence: "**/evidence/**/qg-*.json"
                        gate_id: "G_mutation"
        """;

    private const string PassingEvidence = """
        {
          "$schema": "quality-gates-evidence/v1",
          "story": "demo",
          "gates": [
            { "id": "G1", "status": "pass" },
            { "id": "G_mutation", "status": "pass" }
          ]
        }
        """;

    private const string FailingEvidence = """
        {
          "$schema": "quality-gates-evidence/v1",
          "story": "demo",
          "gates": [
            { "id": "G1", "status": "pass" },
            { "id": "G_mutation", "status": "fail" }
          ]
        }
        """;

    [Test]
    public async Task PassesWhenTheNamedGateStatusIsPass()
    {
        var outcome = await Evaluate(PassingEvidence);
        await Assert.That(outcome.AreAllAssertionsPassing()).IsTrue();
    }

    [Test]
    public async Task FailsWhenTheNamedGateStatusIsNotPass()
    {
        var outcome = await Evaluate(FailingEvidence);
        await Assert.That(outcome.AreAllAssertionsPassing()).IsFalse();
    }

    [Test]
    public async Task FailsWhenNoEvidenceIsProduced()
    {
        var outcome = await Evaluate(matchedContent: null);
        await Assert.That(outcome.AreAllAssertionsPassing()).IsFalse();
    }

    private static async Task<ScenarioOutcome> Evaluate(string? matchedContent)
    {
        var scenario = await LoadSingleScenario(Yaml);

        var view = await scenario.CollectProbeRequests().ResolveWith(
            fileExists: _ => false,
            anyGlobMatches: _ => true,
            anyMatchContains: (_, _) => true,
            judgeFiles: (_, _) => Task.FromResult(true),
            judgeOutput: _ => Task.FromResult(true),
            readMatchedContents: _ => matchedContent is null ? [] : new[] { matchedContent });

        return scenario.EvaluateAgainst(
            AgentRunResult.OutputOnly(new AgentOutput("done")), view);
    }

    private static async Task<Scenario> LoadSingleScenario(string yaml)
    {
        var dir = Directory.CreateTempSubdirectory("skraft-quality-gate-test").FullName;
        try
        {
            await File.WriteAllTextAsync(Path.Combine(dir, "eval.yaml"), yaml);
            var scenarios = await new YamlEvalLoader().LoadAsync(dir, CancellationToken.None);
            Scenario? captured = null;
            try
            {
                await scenarios.EvaluateEachAsync(s =>
                {
                    captured = s;
                    throw new ScenarioCaptured();
                });
            }
            catch (ScenarioCaptured)
            {
            }
            return captured ?? throw new InvalidOperationException("No scenario loaded.");
        }
        finally
        {
            try { Directory.Delete(dir, recursive: true); } catch { /* best-effort */ }
        }
    }

    private sealed class ScenarioCaptured : Exception;
}
