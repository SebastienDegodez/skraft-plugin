using SkraftTestHarness.Cli;

namespace SkraftTestHarness.IntegrationTest.Cli;

/// <summary>
/// <c>run-gate --validate-only</c> loads the eval.skraft.yml and
/// constructs every assertion WITHOUT running any agent — a
/// deterministic, quota-free CI guard that a gate file is well-formed
/// (mirrors verify-checkpoint's spirit). Exit 0 when it parses, 1 on a
/// malformed gate file.
/// </summary>
public sealed class RunGateValidateOnlyEndToEndTests
{
    [Test]
    public async Task ValidateOnly_WhenGateFileIsWellFormed_ShouldExitZero()
    {
        using var workspace = new TempWorkspace();
        workspace.WriteFile("eval.skraft.yml", """
            scenarios:
              - name: "Deliver gate"
                prompt: "Run DELIVER."
                assertions:
                  - craft_conformance:
                      rules:
                        - id: interface-in-app-or-domain
                          glob: "src/**/{Application,Domain}/**/I*.cs"
                          contains: "interface"
                  - conditional:
                      when_prompt_contains: "Microcks"
                      then:
                        - output_contains: "MicrocksContainer"
            """);

        using var stdout = new StringWriter();

        var exitCode = await Program.Run(
            ["run-gate", "--skill", "skraft-orchestrator", "--tests-dir", workspace.Path, "--validate-only"],
            stdout);

        await Assert.That(exitCode).IsEqualTo(0);
        await Assert.That(stdout.ToString()).Contains("gate file is valid");
    }

    [Test]
    public async Task ValidateOnly_WhenGateFileIsMalformed_ShouldExitOne()
    {
        using var workspace = new TempWorkspace();
        workspace.WriteFile("eval.skraft.yml", """
            scenarios:
              - name: "Broken gate"
                prompt: "Run DELIVER."
                assertions:
                  - craft_conformance:
                      rules:
                        - id: missing-keys
            """);

        using var stdout = new StringWriter();

        var exitCode = await Program.Run(
            ["run-gate", "--skill", "skraft-orchestrator", "--tests-dir", workspace.Path, "--validate-only"],
            stdout);

        await Assert.That(exitCode).IsEqualTo(1);
        await Assert.That(stdout.ToString()).Contains("run-gate failed");
    }
}
