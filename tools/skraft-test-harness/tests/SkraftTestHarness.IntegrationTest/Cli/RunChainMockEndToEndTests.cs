using SkraftTestHarness.Cli;

namespace SkraftTestHarness.IntegrationTest.Cli;

/// <summary>
/// End-to-end walking skeleton for the on-demand chained mode (H1):
/// drives <c>skraft-test-harness run-chain --mock</c> through
/// <see cref="Program.Run"/>. Phases run sequentially in a single git
/// worktree created from a committed revision; the chain passes only
/// when every phase gate holds. Exit 0 on PASS, 1 on FAIL. Nothing is
/// committed.
/// </summary>
public sealed class RunChainMockEndToEndTests
{
    [Test]
    public async Task RunChainWithMock_WhenEveryPhasePasses_ShouldExitZeroAndPrintPass()
    {
        var repo = CreateTempRepo();
        var phasesRoot = CreatePhases(
            ("01-DISCOVER", "improved"),
            ("02-DELIVER", "improved"));
        try
        {
            using var stdout = new StringWriter();

            var exitCode = await Program.Run(
                ["run-chain", "--skill", "skraft-orchestrator", "--phases-root", phasesRoot, "--repo", repo, "--rev", "HEAD", "--mock"],
                stdout);

            await Assert.That(exitCode).IsEqualTo(0);
            var output = stdout.ToString();
            await Assert.That(output).Contains("ChainVerdict");
            await Assert.That(output).Contains("PASS");
        }
        finally
        {
            TryDelete(repo);
            TryDelete(phasesRoot);
        }
    }

    [Test]
    public async Task RunChainWithMock_WhenAPhaseFails_ShouldExitOneAndPrintFail()
    {
        var repo = CreateTempRepo();
        var phasesRoot = CreatePhases(
            ("01-DISCOVER", "improved"),
            ("02-DELIVER", "this-text-is-never-produced"));
        try
        {
            using var stdout = new StringWriter();

            var exitCode = await Program.Run(
                ["run-chain", "--skill", "skraft-orchestrator", "--phases-root", phasesRoot, "--repo", repo, "--rev", "HEAD", "--mock"],
                stdout);

            await Assert.That(exitCode).IsEqualTo(1);
            await Assert.That(stdout.ToString()).Contains("FAIL");
        }
        finally
        {
            TryDelete(repo);
            TryDelete(phasesRoot);
        }
    }

    private static string CreatePhases(params (string Dir, string Needle)[] phases)
    {
        var root = Directory.CreateTempSubdirectory("skraft-chain-phases-").FullName;
        foreach (var (dir, needle) in phases)
        {
            var phaseDir = Path.Combine(root, dir);
            Directory.CreateDirectory(phaseDir);
            File.WriteAllText(Path.Combine(phaseDir, "eval.skraft.yml"), $"""
                scenarios:
                  - name: "{dir} gate"
                    prompt: "Run {dir}."
                    assertions:
                      - output_contains: "{needle}"
                """);
        }
        return root;
    }

    private static string CreateTempRepo()
    {
        var repo = Directory.CreateTempSubdirectory("skraft-chain-repo-").FullName;
        Git(repo, "init", "-q", "-b", "main");
        Git(repo, "config", "user.email", "test@example.com");
        Git(repo, "config", "user.name", "Test");
        File.WriteAllText(Path.Combine(repo, "seed.txt"), "seed");
        Git(repo, "add", "-A");
        Git(repo, "commit", "-q", "-m", "seed");
        return repo;
    }

    private static void Git(string workingDir, params string[] args)
    {
        var psi = new System.Diagnostics.ProcessStartInfo("git")
        {
            WorkingDirectory = workingDir,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        };
        foreach (var arg in args)
            psi.ArgumentList.Add(arg);

        using var process = System.Diagnostics.Process.Start(psi)!;
        process.StandardOutput.ReadToEnd();
        process.WaitForExit();
        if (process.ExitCode != 0)
            throw new InvalidOperationException($"git {string.Join(' ', args)} failed: {process.StandardError.ReadToEnd()}");
    }

    private static void TryDelete(string path)
    {
        try { Directory.Delete(path, recursive: true); } catch { /* best-effort */ }
    }
}
