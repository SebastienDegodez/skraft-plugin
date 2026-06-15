using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Infrastructure.Yaml;

namespace SkraftTestHarness.UnitTest.Domain.Assertions;

/// <summary>
/// <c>artifact_contract</c> proves an artefact produced by phase N is
/// consumable by phase N+1, without chaining the real run (mode H2). It
/// aggregates file requirements (a glob, optionally with required text)
/// tagged by the downstream <c>consumer</c>, and passes only when every
/// requirement holds against the produced workspace.
/// </summary>
public sealed class ArtifactContractTests
{
    [Test]
    public async Task PassesWhenEveryRequirementHolds()
    {
        var scenario = await LoadSingleScenario("""
            scenarios:
              - name: "Design phase"
                prompt: "Run DESIGN."
                assertions:
                  - artifact_contract:
                      consumer: "04-DISTILL"
                      requires:
                        - glob: "**/design.md"
                          contains: "## Bounded Contexts"
                        - glob: "**/adr-*.md"
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
    public async Task FailsWhenARequirementIsMissing()
    {
        var scenario = await LoadSingleScenario("""
            scenarios:
              - name: "Design phase"
                prompt: "Run DESIGN."
                assertions:
                  - artifact_contract:
                      consumer: "04-DISTILL"
                      requires:
                        - glob: "**/design.md"
                          contains: "## Bounded Contexts"
            """);

        // The required content is NOT found in the produced workspace.
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
        var dir = Directory.CreateTempSubdirectory("skraft-artifact-contract-test").FullName;
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
