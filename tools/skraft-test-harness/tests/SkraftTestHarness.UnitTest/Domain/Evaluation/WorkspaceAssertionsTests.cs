using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.UnitTest.Domain.Evaluation;

/// <summary>
/// RED: Domain tests for the workspace-aware assertions
/// (<see cref="FileExists"/>, <see cref="FileMatchesGlob"/>,
/// <see cref="FileContains"/>) and the generalized probe collection
/// (<see cref="WorkspaceProbeRequests"/>). The Domain stays IO-free:
/// tests resolve probes with in-memory functions, exactly like
/// Application resolves them through <c>IWorkspaceProbe</c>.
/// </summary>
public sealed class WorkspaceAssertionsTests
{
    private static readonly AgentRunResult AnyRunResult =
        AgentRunResult.OutputOnly(new AgentOutput("irrelevant output"));

    [Test]
    public async Task FileMatchesGlob_ShouldPass_WhenAFileMatchesThePattern()
    {
        var scenario = Scenario.Create(
            name: "Reviewer ran",
            prompt: "Run the pipeline.",
            assertions: [new FileMatchesGlob(new GlobPattern("reviews/**/deliver-review-*.md"))]);

        var view = scenario.CollectProbeRequests().ResolveWith(
            fileExists: _ => false,
            anyGlobMatches: _ => true,
            anyMatchContains: (_, _) => false);

        var outcome = scenario.EvaluateAgainst(AnyRunResult, view);

        await Assert.That(outcome.AreAllAssertionsPassing()).IsTrue();
    }

    [Test]
    public async Task FileMatchesGlob_ShouldFail_WhenNoFileMatchesThePattern()
    {
        var scenario = Scenario.Create(
            name: "Reviewer ran",
            prompt: "Run the pipeline.",
            assertions: [new FileMatchesGlob(new GlobPattern("reviews/**/deliver-review-*.md"))]);

        var view = scenario.CollectProbeRequests().ResolveWith(
            fileExists: _ => false,
            anyGlobMatches: _ => false,
            anyMatchContains: (_, _) => false);

        var outcome = scenario.EvaluateAgainst(AnyRunResult, view);

        await Assert.That(outcome.AreAllAssertionsPassing()).IsFalse();
    }

    [Test]
    public async Task FileContains_ShouldPass_WhenAMatchingFileContainsTheText()
    {
        var scenario = Scenario.Create(
            name: "Reviewer approved",
            prompt: "Run the pipeline.",
            assertions:
            [
                new FileContains(
                    new GlobPattern("reviews/**/deliver-review-*.md"),
                    new Needle("Verdict: APPROVED")),
            ]);

        var view = scenario.CollectProbeRequests().ResolveWith(
            fileExists: _ => false,
            anyGlobMatches: _ => false,
            anyMatchContains: (_, _) => true);

        var outcome = scenario.EvaluateAgainst(AnyRunResult, view);

        await Assert.That(outcome.AreAllAssertionsPassing()).IsTrue();
    }

    [Test]
    public async Task FileContains_ShouldFail_WhenNoMatchingFileContainsTheText()
    {
        var scenario = Scenario.Create(
            name: "Reviewer approved",
            prompt: "Run the pipeline.",
            assertions:
            [
                new FileContains(
                    new GlobPattern("reviews/**/deliver-review-*.md"),
                    new Needle("Verdict: APPROVED")),
            ]);

        var view = scenario.CollectProbeRequests().ResolveWith(
            fileExists: _ => false,
            anyGlobMatches: _ => false,
            anyMatchContains: (_, _) => false);

        var outcome = scenario.EvaluateAgainst(AnyRunResult, view);

        await Assert.That(outcome.AreAllAssertionsPassing()).IsFalse();
    }

    [Test]
    public async Task FileExists_ShouldStillResolveThroughTheProbeRequests()
    {
        var scenario = Scenario.Create(
            name: "File created",
            prompt: "Write output.txt.",
            assertions: [new FileExists(new FilePath("output.txt"))]);

        var view = scenario.CollectProbeRequests().ResolveWith(
            fileExists: path => path.Equals(new FilePath("output.txt")),
            anyGlobMatches: _ => false,
            anyMatchContains: (_, _) => false);

        var outcome = scenario.EvaluateAgainst(AnyRunResult, view);

        await Assert.That(outcome.AreAllAssertionsPassing()).IsTrue();
    }

    [Test]
    public async Task ResolveWith_ShouldHandEachDeclaredProbeToItsResolver()
    {
        var probedFiles = new List<string>();
        var probedGlobs = new List<string>();
        var probedContents = new List<string>();

        var scenario = Scenario.Create(
            name: "All probe kinds",
            prompt: "Run.",
            assertions:
            [
                new FileExists(new FilePath("state.json")),
                new FileMatchesGlob(new GlobPattern("reviews/**/*.md")),
                new FileContains(new GlobPattern("**/state.json"), new Needle("\"DELIVER\": \"APPROVED\"")),
            ]);

        _ = scenario.CollectProbeRequests().ResolveWith(
            fileExists: path => { probedFiles.Add(path.ToString()); return true; },
            anyGlobMatches: glob => { probedGlobs.Add(glob.ToString()); return true; },
            anyMatchContains: (glob, needle) =>
            {
                probedContents.Add($"{glob}|{needle}");
                return true;
            });

        await Assert.That(probedFiles).Contains("state.json");
        await Assert.That(probedGlobs).Contains("reviews/**/*.md");
        await Assert.That(probedContents).Contains("**/state.json|\"DELIVER\": \"APPROVED\"");
    }
}
