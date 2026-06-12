using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Infrastructure.Yaml;

namespace SkraftTestHarness.UnitTest.Infrastructure.Yaml;

/// <summary>
/// RED: <see cref="YamlEvalLoader"/> must map the workspace and
/// LLM-backed assertion kinds (`file_exists`, `file_matches_glob`,
/// `file_contains`, `file_judge`, `output_judge`) so the whole use
/// case can live in eval.yaml files. Mapping is verified behaviourally:
/// the loaded scenario declares the expected probes/judgements.
/// </summary>
public sealed class YamlEvalLoaderWorkspaceAssertionsTests
{
    [Test]
    public async Task ShouldMapFileExistsAssertion()
    {
        var scenario = await LoadSingleScenario("""
            scenarios:
              - name: "File created"
                prompt: "Write output.txt."
                assertions:
                  - file_exists: "output.txt"
            """);

        var declared = new List<string>();
        _ = scenario.CollectProbeRequests().ResolveWith(
            fileExists: p => { declared.Add(p.ToString()); return true; },
            anyGlobMatches: _ => false,
            anyMatchContains: (_, _) => false);

        await Assert.That(declared).Contains("output.txt");
    }

    [Test]
    public async Task ShouldMapFileMatchesGlobAssertion()
    {
        var scenario = await LoadSingleScenario("""
            scenarios:
              - name: "Reviewer ran"
                prompt: "Run the phase."
                assertions:
                  - file_matches_glob: "reviews/**/deliver-review-*.md"
            """);

        var declared = new List<string>();
        _ = scenario.CollectProbeRequests().ResolveWith(
            fileExists: _ => false,
            anyGlobMatches: g => { declared.Add(g.ToString()); return true; },
            anyMatchContains: (_, _) => false);

        await Assert.That(declared).Contains("reviews/**/deliver-review-*.md");
    }

    [Test]
    public async Task ShouldMapFileContainsAssertionFromMapping()
    {
        var scenario = await LoadSingleScenario("""
            scenarios:
              - name: "Reviewer approved"
                prompt: "Run the phase."
                assertions:
                  - file_contains:
                      glob: "reviews/**/deliver-review-*.md"
                      text: "Verdict: APPROVED"
            """);

        var declared = new List<string>();
        _ = scenario.CollectProbeRequests().ResolveWith(
            fileExists: _ => false,
            anyGlobMatches: _ => false,
            anyMatchContains: (g, n) => { declared.Add($"{g}|{n}"); return true; });

        await Assert.That(declared).Contains("reviews/**/deliver-review-*.md|Verdict: APPROVED");
    }

    [Test]
    public async Task ShouldMapFileJudgeAssertionFromMapping()
    {
        var scenario = await LoadSingleScenario("""
            scenarios:
              - name: "ADR quality"
                prompt: "Design the feature."
                assertions:
                  - file_judge:
                      glob: "adrs/adr-*.md"
                      criterion: "lists at least two alternatives"
            """);

        var declared = new List<string>();
        _ = await scenario.CollectProbeRequests().ResolveWith(
            fileExists: _ => false,
            anyGlobMatches: _ => false,
            anyMatchContains: (_, _) => false,
            judgeFiles: (g, c) => { declared.Add($"{g}|{c}"); return Task.FromResult(true); },
            judgeOutput: _ => Task.FromResult(true));

        await Assert.That(declared).Contains("adrs/adr-*.md|lists at least two alternatives");
    }

    [Test]
    public async Task ShouldMapOutputJudgeAssertionFromMapping()
    {
        var scenario = await LoadSingleScenario("""
            scenarios:
              - name: "Business language"
                prompt: "Explain the plan."
                assertions:
                  - output_judge:
                      criterion: "uses business vocabulary only"
            """);

        var declared = new List<string>();
        _ = await scenario.CollectProbeRequests().ResolveWith(
            fileExists: _ => false,
            anyGlobMatches: _ => false,
            anyMatchContains: (_, _) => false,
            judgeFiles: (_, _) => Task.FromResult(true),
            judgeOutput: c => { declared.Add(c.ToString()); return Task.FromResult(true); });

        await Assert.That(declared).Contains("uses business vocabulary only");
    }

    [Test]
    public async Task ShouldRejectFileContainsMissingText()
    {
        await Assert.That(async () => await LoadSingleScenario("""
            scenarios:
              - name: "Broken"
                prompt: "x"
                assertions:
                  - file_contains:
                      glob: "reviews/*.md"
            """)).Throws<ArgumentException>();
    }

    [Test]
    public async Task ShouldStillMapOutputAssertionsAsScalars()
    {
        var scenario = await LoadSingleScenario("""
            scenarios:
              - name: "Scalar kinds"
                prompt: "Say hi."
                assertions:
                  - output_contains: "hi"
                  - output_not_matches: "(?i)goodbye"
            """);

        var outcome = scenario.EvaluateAgainst(
            AgentRunResult.OutputOnly(new AgentOutput("hi there")),
            WorkspaceView.Empty());

        await Assert.That(outcome.AreAllAssertionsPassing()).IsTrue();
    }

    private static async Task<Scenario> LoadSingleScenario(string yaml)
    {
        var dir = Directory.CreateTempSubdirectory("skraft-yaml-loader-test").FullName;
        try
        {
            await File.WriteAllTextAsync(Path.Combine(dir, "eval.yaml"), yaml);
            var scenarios = await new YamlEvalLoader().LoadAsync(dir, CancellationToken.None);
            return await CaptureSingle(scenarios);
        }
        finally
        {
            try { Directory.Delete(dir, recursive: true); } catch { /* best-effort */ }
        }
    }

    /// <summary>
    /// <see cref="Scenarios"/> is a first-class collection without
    /// direct accessors; capture the single scenario through the
    /// evaluation callback and short-circuit with a sentinel.
    /// </summary>
    private static async Task<Scenario> CaptureSingle(Scenarios scenarios)
    {
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

    private sealed class ScenarioCaptured : Exception;
}
