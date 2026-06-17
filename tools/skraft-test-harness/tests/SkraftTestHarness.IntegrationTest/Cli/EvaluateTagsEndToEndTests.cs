using SkraftTestHarness.Cli;

namespace SkraftTestHarness.IntegrationTest.Cli;

/// <summary>
/// RED: drives <c>evaluate --tags</c> through <see cref="Program.Run"/>:
/// scenarios carry <c>tags:</c> in eval.yaml and the CLI runs only the
/// selected category (AND semantics, case-insensitive).
/// </summary>
public sealed class EvaluateTagsEndToEndTests
{
    private const string TaggedSuite = """
        scenarios:
          - name: "Smoke check"
            tags: [discover, smoke]
            prompt: "Say hi."
            assertions:
              - output_contains: "hi"
          - name: "Simulation check"
            tags: [deliver, simulation]
            prompt: "Say hi."
            assertions:
              - output_contains: "hi"
        """;

    [Test]
    public async Task ShouldRunOnlyTheScenariosMatchingTheRequestedTags()
    {
        using var workspace = new TempWorkspace();
        workspace.WriteEvalYaml(TaggedSuite);
        using var stdout = new StringWriter();

        var exitCode = await Program.Run(
            ["evaluate", "--skill", "test-skill", "--tests-dir", workspace.Path,
             "--mock", "--tags", "deliver,simulation"],
            stdout);

        await Assert.That(exitCode).IsEqualTo(0);
        await Assert.That(stdout.ToString()).Contains("scenarios=1");
    }

    [Test]
    public async Task ShouldRunEverythingWhenNoTagsAreRequested()
    {
        using var workspace = new TempWorkspace();
        workspace.WriteEvalYaml(TaggedSuite);
        using var stdout = new StringWriter();

        var exitCode = await Program.Run(
            ["evaluate", "--skill", "test-skill", "--tests-dir", workspace.Path, "--mock"],
            stdout);

        await Assert.That(exitCode).IsEqualTo(0);
        await Assert.That(stdout.ToString()).Contains("scenarios=2");
    }

    [Test]
    public async Task ShouldFailFastWhenNoScenarioMatchesTheTags()
    {
        using var workspace = new TempWorkspace();
        workspace.WriteEvalYaml(TaggedSuite);
        using var stdout = new StringWriter();

        var exitCode = await Program.Run(
            ["evaluate", "--skill", "test-skill", "--tests-dir", workspace.Path,
             "--mock", "--tags", "nonexistent"],
            stdout);

        await Assert.That(exitCode).IsNotEqualTo(0);
        await Assert.That(stdout.ToString()).Contains("tags");
    }
}
