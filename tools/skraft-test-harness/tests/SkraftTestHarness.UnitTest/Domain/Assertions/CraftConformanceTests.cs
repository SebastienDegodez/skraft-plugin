using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Infrastructure.Yaml;

namespace SkraftTestHarness.UnitTest.Domain.Assertions;

/// <summary>
/// <c>craft_conformance</c> asserts a set of identified architecture
/// rules against the produced workspace. It is an extensible catalogue:
/// each rule's kind is resolved from its keys, so adding a rule kind
/// does not change the engine. This suite pins the first kind
/// (<c>glob</c> + <c>contains</c>) and the dispatch behaviour.
/// </summary>
public sealed class CraftConformanceTests
{
    [Test]
    public async Task PassesWhenEveryRuleHolds()
    {
        var scenario = await LoadSingleScenario("""
            scenarios:
              - name: "Deliver phase"
                prompt: "Run DELIVER."
                assertions:
                  - craft_conformance:
                      rules:
                        - id: interface-in-app-or-domain
                          glob: "**/src/**/{Application,Domain}/**/I*.cs"
                          contains: "interface"
            """);

        var view = await scenario.CollectProbeRequests().ResolveWith(
            fileExists: _ => false,
            anyGlobMatches: _ => true,
            anyMatchContains: (_, _) => true,
            judgeFiles: (_, _) => Task.FromResult(true),
            judgeOutput: _ => Task.FromResult(true));

        var outcome = scenario.EvaluateAgainst(
            AgentRunResult.OutputOnly(new AgentOutput("done")), view);

        await Assert.That(outcome.AreAllAssertionsPassing()).IsTrue();
    }

    [Test]
    public async Task FailsWhenARuleIsViolated()
    {
        var scenario = await LoadSingleScenario("""
            scenarios:
              - name: "Deliver phase"
                prompt: "Run DELIVER."
                assertions:
                  - craft_conformance:
                      rules:
                        - id: interface-in-app-or-domain
                          glob: "**/src/**/{Application,Domain}/**/I*.cs"
                          contains: "interface"
            """);

        var view = await scenario.CollectProbeRequests().ResolveWith(
            fileExists: _ => false,
            anyGlobMatches: _ => false,
            anyMatchContains: (_, _) => false,
            judgeFiles: (_, _) => Task.FromResult(false),
            judgeOutput: _ => Task.FromResult(false));

        var outcome = scenario.EvaluateAgainst(
            AgentRunResult.OutputOnly(new AgentOutput("done")), view);

        await Assert.That(outcome.AreAllAssertionsPassing()).IsFalse();
    }

    private static async Task<Scenario> LoadSingleScenario(string yaml)
    {
        var dir = Directory.CreateTempSubdirectory("skraft-craft-conformance-test").FullName;
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
