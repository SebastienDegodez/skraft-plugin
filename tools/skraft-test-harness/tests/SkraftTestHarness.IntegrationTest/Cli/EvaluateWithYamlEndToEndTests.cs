using SkraftTestHarness.Cli;

namespace SkraftTestHarness.IntegrationTest.Cli;

/// <summary>
/// End-to-end test for the YAML scenario loader: writes a temp
/// <c>eval.yaml</c> containing two scenarios with various assertion
/// kinds, drives <c>evaluate --mock --tests-dir</c>, and asserts the
/// verdict line reflects both scenarios.
/// </summary>
public sealed class EvaluateWithYamlEndToEndTests
{
    [Test]
    public async Task EvaluateWithYaml_ShouldLoadTwoScenariosAndReportThem()
    {
        using var workspace = new TempWorkspace();
        workspace.WriteEvalYaml("""
            scenarios:
              - name: "Echo hi"
                prompt: "Say hi."
                assertions:
                  - output_contains: "hi"
                  - output_not_contains: "bye"

              - name: "Matches greeting"
                prompt: "Greet the user."
                assertions:
                  - output_matches: "^.*hi.*$"
                  - output_not_matches: "goodbye"
            """);

        using var stdout = new StringWriter();

        var exitCode = await Program.Run(
            ["evaluate", "--skill", "demo-skill", "--tests-dir", workspace.Path, "--mock"],
            stdout);

        await Assert.That(exitCode).IsEqualTo(0);
        var output = stdout.ToString();
        await Assert.That(output).Contains("SkillVerdict(skill=demo-skill, scenarios=2");
        await Assert.That(output).Contains("winner: with-skill");
    }
}
