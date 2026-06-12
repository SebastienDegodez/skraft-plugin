using SkraftTestHarness.Cli;

namespace SkraftTestHarness.IntegrationTest.Cli;

/// <summary>
/// E2E (mock, CI-safe): a scenario declaring
/// <c>workspace: { fixture, checkpoint }</c> is evaluated inside a
/// fresh clone provisioned from <c>--fixtures-root</c>; workspace
/// assertions resolve against the clone's real files and judge
/// assertions resolve through the deterministic mock judge.
/// </summary>
public sealed class EvaluateWorkspaceEndToEndTests
{
    [Test]
    public async Task ShouldResolveWorkspaceAssertionsAgainstTheProvisionedCheckpoint()
    {
        using var workspace = new TempWorkspace();
        workspace.WriteFile(
            "fixtures/checkpoints/after-design/.copilot-tracking/skraft-plans/order-discount/reviews/2026-06-12/design-review-1.md",
            "# Design Review\n\n**Verdict:** APPROVED\n");
        workspace.WriteEvalYaml("""
            scenarios:
              - name: "DESIGN checkpoint is conformant"
                tags: [design, simulation]
                workspace:
                  fixture: clean-architecture-app
                  checkpoint: after-design
                prompt: "Resume from state.json and verify the DESIGN artefacts."
                assertions:
                  - file_matches_glob: ".copilot-tracking/skraft-plans/*/reviews/*/design-review-*.md"
                  - file_contains:
                      glob: ".copilot-tracking/skraft-plans/*/reviews/*/design-review-*.md"
                      text: "Verdict: APPROVED"
                  - output_judge:
                      criterion: "acknowledges the design phase"
            """);

        using var stdout = new StringWriter();

        var exitCode = await Program.Run(
            ["evaluate", "--skill", "skraft-orchestrator",
             "--tests-dir", workspace.Path,
             "--fixtures-root", Path.Combine(workspace.Path, "fixtures"),
             "--mock"],
            stdout);

        await Assert.That(exitCode).IsEqualTo(0);
        await Assert.That(stdout.ToString()).Contains("SkillVerdict(skill=skraft-orchestrator");
    }

    [Test]
    public async Task ShouldFailWhenTheDeclaredCheckpointDoesNotExist()
    {
        using var workspace = new TempWorkspace();
        workspace.WriteEvalYaml("""
            scenarios:
              - name: "Missing checkpoint"
                workspace:
                  fixture: clean-architecture-app
                  checkpoint: after-nonexistent
                prompt: "Run."
                assertions:
                  - output_contains: "hi"
            """);

        using var stdout = new StringWriter();

        var exitCode = await Program.Run(
            ["evaluate", "--skill", "test-skill",
             "--tests-dir", workspace.Path,
             "--fixtures-root", Path.Combine(workspace.Path, "fixtures"),
             "--mock"],
            stdout);

        await Assert.That(exitCode).IsNotEqualTo(0);
        await Assert.That(stdout.ToString()).Contains("evaluation failed");
    }
}
