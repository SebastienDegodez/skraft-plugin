using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Infrastructure.Yaml;

namespace SkraftTestHarness.UnitTest.Domain.Assertions;

/// <summary>
/// <c>conditional</c> verifies an opt-in requirement declared in the
/// prompt: the inner <c>then</c> assertions are evaluated ONLY when the
/// prompt contains the trigger. When absent, the conditional is inert
/// (passes vacuously) — no false negative. When present, both the
/// produced artefact AND its propagation to downstream phases are
/// required (e.g. Microcks test produced + obligation written into an
/// agent.md / copilot-instructions).
/// </summary>
public sealed class ConditionalAssertionTests
{
    private const string MicrocksYaml = """
        scenarios:
          - name: "Deliver phase"
            prompt: "{PROMPT}"
            assertions:
              - conditional:
                  when_prompt_contains: "Microcks"
                  then:
                    - file_contains:
                        glob: "**/tests/**/*.cs"
                        text: "MicrocksContainer"
                    - artifact_contract:
                        consumer: "next-phases"
                        requires:
                          - glob: "**/*.agent.md"
                            contains: "Microcks"
        """;

    [Test]
    public async Task IsInertWhenPromptDoesNotContainTheTrigger()
    {
        // Prompt without "Microcks": the then-assertions are not evaluated,
        // even though the workspace satisfies nothing.
        var scenario = await LoadSingleScenario(MicrocksYaml.Replace("{PROMPT}", "Implement the checkout discount."));

        var view = await scenario.CollectProbeRequests().ResolveWith(
            fileExists: _ => false,
            anyGlobMatches: _ => false,
            anyMatchContains: (_, _) => false,
            judgeFiles: (_, _) => Task.FromResult(false),
            judgeOutput: _ => Task.FromResult(false));

        var outcome = scenario.EvaluateAgainst(
            AgentRunResult.OutputOnly(new AgentOutput("done")), view);

        await Assert.That(outcome.AreAllAssertionsPassing()).IsTrue();
    }

    [Test]
    public async Task EvaluatesThenWhenPromptContainsTheTrigger_AndPasses()
    {
        var scenario = await LoadSingleScenario(MicrocksYaml.Replace("{PROMPT}", "Deliver the checkout with Microcks contract tests."));

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
    public async Task EvaluatesThenWhenPromptContainsTheTrigger_AndFailsWhenPropagationMissing()
    {
        var scenario = await LoadSingleScenario(MicrocksYaml.Replace("{PROMPT}", "Deliver the checkout with Microcks contract tests."));

        // The Microcks test exists but the obligation is NOT propagated downstream.
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
        var dir = Directory.CreateTempSubdirectory("skraft-conditional-test").FullName;
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
