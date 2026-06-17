using SkraftTestHarness.Infrastructure.Workspace;

namespace SkraftTestHarness.IntegrationTest.Workspace;

/// <summary>
/// The on-demand chained mode (H1) runs phases sequentially in a git
/// worktree created from a committed revision, so the real output of
/// phase N feeds phase N+1. Nothing is ever committed: the worktree is
/// removed on dispose. This pins the provisioner's create/expose/remove
/// contract against a throwaway git repository.
/// </summary>
public sealed class GitWorktreeProvisionerTests
{
    [Test]
    public async Task CreatesAWorktreeFromHeadAndRemovesItOnDispose()
    {
        var repo = CreateTempRepo(out var headSha);
        string worktreeRoot;
        try
        {
            using (var provisioner = new GitWorktreeProvisioner(repo))
            {
                worktreeRoot = provisioner.ProvisionFrom(headSha);

                await Assert.That(Directory.Exists(worktreeRoot)).IsTrue();
                // The committed file is materialised in the worktree.
                await Assert.That(File.Exists(Path.Combine(worktreeRoot, "seed.txt"))).IsTrue();
            }

            // After dispose the worktree directory is gone — nothing leaks, nothing committed.
            await Assert.That(Directory.Exists(worktreeRoot)).IsFalse();
        }
        finally
        {
            TryDelete(repo);
        }
    }

    private static string CreateTempRepo(out string headSha)
    {
        var repo = Directory.CreateTempSubdirectory("skraft-worktree-repo-").FullName;
        Git(repo, "init", "-q", "-b", "main");
        Git(repo, "config", "user.email", "test@example.com");
        Git(repo, "config", "user.name", "Test");
        File.WriteAllText(Path.Combine(repo, "seed.txt"), "seed");
        Git(repo, "add", "-A");
        Git(repo, "commit", "-q", "-m", "seed");
        headSha = Git(repo, "rev-parse", "HEAD").Trim();
        return repo;
    }

    private static string Git(string workingDir, params string[] args)
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
        var stdout = process.StandardOutput.ReadToEnd();
        process.WaitForExit();
        if (process.ExitCode != 0)
            throw new InvalidOperationException($"git {string.Join(' ', args)} failed: {process.StandardError.ReadToEnd()}");
        return stdout;
    }

    private static void TryDelete(string path)
    {
        try { Directory.Delete(path, recursive: true); } catch { /* best-effort */ }
    }
}
