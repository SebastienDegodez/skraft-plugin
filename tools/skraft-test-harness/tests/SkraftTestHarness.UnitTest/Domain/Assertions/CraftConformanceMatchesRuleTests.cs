using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Infrastructure.Yaml;

namespace SkraftTestHarness.UnitTest.Domain.Assertions;

/// <summary>
/// The <c>glob</c> + <c>matches</c> craft-rule kind asserts that some
/// file matching the glob has CONTENT matching a regex — e.g. an
/// Infrastructure class implementing a gateway/repository interface.
/// This needs the matched files' contents, resolved into the
/// <see cref="WorkspaceView"/> (design option C).
/// </summary>
public sealed class CraftConformanceMatchesRuleTests
{
    private const string Yaml = """
        scenarios:
          - name: "Deliver phase"
            prompt: "Run DELIVER."
            assertions:
              - craft_conformance:
                  rules:
                    - id: gateway-impl-in-infra
                      glob: "**/Infrastructure/**/*.cs"
                      matches: ":\\s*I\\w+(Gateway|Repository)"
        """;

    [Test]
    public async Task PassesWhenAMatchedFileContentMatchesTheRegex()
    {
        var scenario = await LoadSingleScenario(Yaml);

        var view = await scenario.CollectProbeRequests().ResolveWith(
            fileExists: _ => false,
            anyGlobMatches: _ => true,
            anyMatchContains: (_, _) => true,
            judgeFiles: (_, _) => Task.FromResult(true),
            judgeOutput: _ => Task.FromResult(true),
            readMatchedContents: _ => new[] { "public sealed class OrderRepo : IOrderRepository { }" });

        var outcome = scenario.EvaluateAgainst(
            AgentRunResult.OutputOnly(new AgentOutput("done")), view);

        await Assert.That(outcome.AreAllAssertionsPassing()).IsTrue();
    }

    [Test]
    public async Task FailsWhenNoMatchedFileContentMatchesTheRegex()
    {
        var scenario = await LoadSingleScenario(Yaml);

        var view = await scenario.CollectProbeRequests().ResolveWith(
            fileExists: _ => false,
            anyGlobMatches: _ => true,
            anyMatchContains: (_, _) => true,
            judgeFiles: (_, _) => Task.FromResult(true),
            judgeOutput: _ => Task.FromResult(true),
            readMatchedContents: _ => new[] { "public sealed class Orphan { }" });

        var outcome = scenario.EvaluateAgainst(
            AgentRunResult.OutputOnly(new AgentOutput("done")), view);

        await Assert.That(outcome.AreAllAssertionsPassing()).IsFalse();
    }

    private static async Task<Scenario> LoadSingleScenario(string yaml)
    {
        var dir = Directory.CreateTempSubdirectory("skraft-craft-matches-test").FullName;
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
