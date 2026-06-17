using SkraftTestHarness.Cli;

namespace SkraftTestHarness.IntegrationTest.Cli;

/// <summary>
/// End-to-end walking skeleton for the absolute gate mode: drives
/// <c>skraft-test-harness run-gate --mock</c> through
/// <see cref="Program.Run"/>, loading scenarios from a real
/// <c>eval.skraft.yml</c>. The verdict is absolute: exit 0 + PASS when
/// every assertion holds, exit 1 + FAIL otherwise. No baseline, no
/// winner comparison.
/// </summary>
public sealed class RunGateMockEndToEndTests
{
    [Test]
    public async Task RunGateWithMock_WhenAssertionsHold_ShouldExitZeroAndPrintPass()
    {
        using var workspace = new TempWorkspace();
        workspace.WriteFile("eval.skraft.yml", """
            scenarios:
              - name: "Deliver gate"
                prompt: "Run DELIVER."
                assertions:
                  - output_contains: "improved"
            """);

        using var stdout = new StringWriter();

        var exitCode = await Program.Run(
            ["run-gate", "--skill", "skraft-orchestrator", "--tests-dir", workspace.Path, "--mock"],
            stdout);

        await Assert.That(exitCode).IsEqualTo(0);
        var output = stdout.ToString();
        await Assert.That(output).Contains("GateVerdict");
        await Assert.That(output).Contains("PASS");
    }

    [Test]
    public async Task RunGateWithMock_WhenAnAssertionFails_ShouldExitOneAndPrintFail()
    {
        using var workspace = new TempWorkspace();
        workspace.WriteFile("eval.skraft.yml", """
            scenarios:
              - name: "Deliver gate"
                prompt: "Run DELIVER."
                assertions:
                  - output_contains: "this-text-is-never-produced"
            """);

        using var stdout = new StringWriter();

        var exitCode = await Program.Run(
            ["run-gate", "--skill", "skraft-orchestrator", "--tests-dir", workspace.Path, "--mock"],
            stdout);

        await Assert.That(exitCode).IsEqualTo(1);
        await Assert.That(stdout.ToString()).Contains("FAIL");
    }
}
