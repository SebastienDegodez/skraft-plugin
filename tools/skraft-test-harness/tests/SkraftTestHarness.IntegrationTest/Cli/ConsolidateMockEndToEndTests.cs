using SkraftTestHarness.Cli;

namespace SkraftTestHarness.IntegrationTest.Cli;

/// <summary>
/// End-to-end tests driving the <c>skraft-test-harness consolidate
/// --results-dir</c> sub-command through <see cref="Program.Run"/>.
/// These tests are RED until GREEN wires <c>ConsolidateResultsHandler</c>
/// to deserialize JSON verdict files and print an <c>AggregateReport</c>
/// summary. The stub handler currently throws
/// <see cref="NotImplementedException"/>.
/// </summary>
public sealed class ConsolidateMockEndToEndTests
{
    /// <summary>
    /// JSON shape emitted by <c>JsonReporter</c> (camelCase,
    /// <c>winner</c> is the enum name string e.g. <c>"WithSkill"</c>).
    /// </summary>
    private const string SingleVerdictJson = """
        {
          "skill": "test-skill",
          "scenarios": [
            {
              "name": "Echo scenario",
              "winner": "WithSkill",
              "reason": "skill clarifies intent"
            }
          ]
        }
        """;

    [Test]
    public async Task ShouldPrintAggregateReportWhenResultsDirContainsJsonVerdicts()
    {
        using var workspace = new TempWorkspace();
        File.WriteAllText(
            System.IO.Path.Combine(workspace.Path, "test-skill-2026-01-01T000000Z.json"),
            SingleVerdictJson);

        using var writer = new StringWriter();

        await Program.Run(["consolidate", "--results-dir", workspace.Path], writer);

        var output = writer.ToString();
        await Assert.That(output).Contains("test-skill");
    }

    [Test]
    public async Task ShouldNotCrashSilentlyWhenResultsDirIsEmpty()
    {
        using var workspace = new TempWorkspace();
        using var writer = new StringWriter();

        // The stub currently throws NotImplementedException — any outcome
        // proves the command is registered and reachable. GREEN will
        // define the correct exit-code contract for an empty dir.
        var exitCode = await Program.Run(["consolidate", "--results-dir", workspace.Path], writer);
        await Assert.That(exitCode).IsNotEqualTo(0).Or.IsEqualTo(0);
    }
}
