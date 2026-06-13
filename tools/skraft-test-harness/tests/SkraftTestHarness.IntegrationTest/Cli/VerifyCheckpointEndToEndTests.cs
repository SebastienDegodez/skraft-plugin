using SkraftTestHarness.Cli;

namespace SkraftTestHarness.IntegrationTest.Cli;

/// <summary>
/// RED: <c>verify-checkpoint</c> evaluates ONLY the file assertions of
/// an eval suite against the committed checkpoints — no agent run, no
/// LLM. It is the conformance contract keeping the phase N starting
/// files aligned with what phase N-1 is supposed to produce.
/// </summary>
public sealed class VerifyCheckpointEndToEndTests
{
    private const string DesignSuite = """
        scenarios:
          - name: "DESIGN artefacts are conformant"
            tags: [design, simulation]
            workspace:
              fixture: clean-architecture-app
              checkpoint: after-design
            prompt: "Run the DESIGN phase."
            assertions:
              - file_matches_glob: ".copilot-tracking/skraft-plans/*/reviews/*/design-review-*.md"
              - file_contains:
                  glob: ".copilot-tracking/skraft-plans/*/reviews/*/design-review-*.md"
                  text: "Verdict: APPROVED"
              - output_judge:
                  criterion: "must be ignored by verify-checkpoint"
        """;

    [Test]
    public async Task ShouldExitZeroWhenTheCheckpointSatisfiesEveryFileAssertion()
    {
        using var workspace = new TempWorkspace();
        workspace.WriteFile(
            "fixtures/clean-architecture-app/src/OrderDiscount.Domain/Order.cs",
            "namespace OrderDiscount.Domain; public sealed class Order;");
        workspace.WriteFile(
            "fixtures/checkpoints/after-design/.copilot-tracking/skraft-plans/order-discount/reviews/2026-06-12/design-review-1.md",
            "# Design Review\n\nVerdict: APPROVED\n");
        workspace.WriteEvalYaml(DesignSuite);
        using var stdout = new StringWriter();

        var exitCode = await Program.Run(
            ["verify-checkpoint",
             "--tests-dir", workspace.Path,
             "--fixtures-root", Path.Combine(workspace.Path, "fixtures")],
            stdout);

        await Assert.That(exitCode).IsEqualTo(0);
        await Assert.That(stdout.ToString()).Contains("conformant");
    }

    [Test]
    public async Task ShouldExitNonZeroAndNameTheFailureWhenTheCheckpointDrifted()
    {
        using var workspace = new TempWorkspace();
        workspace.WriteFile(
            "fixtures/clean-architecture-app/src/OrderDiscount.Domain/Order.cs",
            "namespace OrderDiscount.Domain; public sealed class Order;");
        workspace.WriteFile(
            "fixtures/checkpoints/after-design/.copilot-tracking/skraft-plans/order-discount/reviews/2026-06-12/design-review-1.md",
            "# Design Review\n\nVerdict: NEEDS_REWORK\n"); // drifted content
        workspace.WriteEvalYaml(DesignSuite);
        using var stdout = new StringWriter();

        var exitCode = await Program.Run(
            ["verify-checkpoint",
             "--tests-dir", workspace.Path,
             "--fixtures-root", Path.Combine(workspace.Path, "fixtures")],
            stdout);

        await Assert.That(exitCode).IsNotEqualTo(0);
        await Assert.That(stdout.ToString()).Contains("Verdict: APPROVED");
    }

    [Test]
    public async Task ShouldSkipScenariosWithoutAWorkspaceDeclaration()
    {
        using var workspace = new TempWorkspace();
        workspace.WriteEvalYaml("""
            scenarios:
              - name: "Prompt-only smoke"
                tags: [smoke]
                prompt: "Say hi."
                assertions:
                  - output_contains: "hi"
            """);
        using var stdout = new StringWriter();

        var exitCode = await Program.Run(
            ["verify-checkpoint",
             "--tests-dir", workspace.Path,
             "--fixtures-root", Path.Combine(workspace.Path, "fixtures")],
            stdout);

        await Assert.That(exitCode).IsEqualTo(0);
        await Assert.That(stdout.ToString()).Contains("skipped");
    }
}
