using SkraftTestHarness.Cli;

namespace SkraftTestHarness.IntegrationTest.Cli;

/// <summary>
/// CI guard: runs <c>verify-checkpoint</c> against the committed
/// <c>order-discount</c> simulation fixtures and the
/// <c>phase-conformance</c> eval suite. Deterministic (no agent, no LLM)
/// so it runs on every push: it fails the build the moment a committed
/// checkpoint drifts from the artefact format a phase is supposed to
/// produce.
/// </summary>
public sealed class PhaseConformanceEndToEndTests
{
    [Test]
    public async Task EveryCommittedCheckpointIsConformant()
    {
        var harnessRoot = LocateHarnessRoot();
        var fixturesRoot = Path.Combine(harnessRoot, "fixtures");
        var testsDir = Path.GetFullPath(
            Path.Combine(harnessRoot, "..", "..", "tests", "skraft-plugin", "phase-conformance"));

        using var stdout = new StringWriter();

        var exitCode = await Program.Run(
            ["verify-checkpoint", "--tests-dir", testsDir, "--fixtures-root", fixturesRoot],
            stdout);

        await Assert.That(exitCode).IsEqualTo(0);
        await Assert.That(stdout.ToString()).Contains("checkpoints conformant");
    }

    [Test]
    public async Task TagFilterVerifiesASinglePhaseCheckpoint()
    {
        var harnessRoot = LocateHarnessRoot();
        var fixturesRoot = Path.Combine(harnessRoot, "fixtures");
        var testsDir = Path.GetFullPath(
            Path.Combine(harnessRoot, "..", "..", "tests", "skraft-plugin", "phase-conformance"));

        using var stdout = new StringWriter();

        var exitCode = await Program.Run(
            ["verify-checkpoint", "--tests-dir", testsDir, "--fixtures-root", fixturesRoot, "--tags", "design"],
            stdout);

        await Assert.That(exitCode).IsEqualTo(0);
        await Assert.That(stdout.ToString()).Contains("DESIGN checkpoint");
        await Assert.That(stdout.ToString()).DoesNotContain("DISCOVER checkpoint");
    }

    /// <summary>Walks up from the test binary to the harness root (the dir holding <c>fixtures/checkpoints</c>).</summary>
    private static string LocateHarnessRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            if (Directory.Exists(Path.Combine(directory.FullName, "fixtures", "checkpoints", "after-discover")))
                return directory.FullName;
            directory = directory.Parent;
        }

        throw new DirectoryNotFoundException(
            "Could not locate the harness root (no 'fixtures/checkpoints/after-discover' above the test binary).");
    }
}
