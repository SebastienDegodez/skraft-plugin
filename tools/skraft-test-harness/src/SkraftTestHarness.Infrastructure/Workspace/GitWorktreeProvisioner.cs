using System.Diagnostics;

namespace SkraftTestHarness.Infrastructure.Workspace;

/// <summary>
/// Provisions a throwaway git worktree from a committed revision for the
/// on-demand chained mode (H1). Phases run sequentially in the same
/// worktree so the real output of phase N feeds phase N+1; the worktree
/// is removed on dispose, so nothing is ever committed and no state
/// leaks. The backing repository is never mutated.
/// </summary>
public sealed class GitWorktreeProvisioner : IDisposable
{
    private readonly string _repositoryRoot;
    private readonly List<string> _worktrees = [];

    public GitWorktreeProvisioner(string repositoryRoot)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(repositoryRoot);
        _repositoryRoot = repositoryRoot;
    }

    /// <summary>Adds a detached worktree checked out at <paramref name="revision"/> and returns its root.</summary>
    public string ProvisionFrom(string revision)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(revision);

        var worktreeRoot = Directory.CreateTempSubdirectory("skraft-worktree-").FullName;
        // CreateTempSubdirectory already made the directory; `git worktree add`
        // refuses an existing non-empty path, so remove it first and let git
        // recreate it.
        Directory.Delete(worktreeRoot, recursive: true);

        Git("worktree", "add", "--detach", worktreeRoot, revision);
        _worktrees.Add(worktreeRoot);
        return worktreeRoot;
    }

    public void Dispose()
    {
        foreach (var worktree in _worktrees)
        {
            try
            {
                Git("worktree", "remove", "--force", worktree);
            }
            catch
            {
                // best-effort: fall back to a raw directory delete so nothing leaks.
                try { Directory.Delete(worktree, recursive: true); } catch { /* ignore */ }
            }
        }

        _worktrees.Clear();
    }

    private string Git(params string[] args)
    {
        var psi = new ProcessStartInfo("git")
        {
            WorkingDirectory = _repositoryRoot,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        };
        foreach (var arg in args)
            psi.ArgumentList.Add(arg);

        using var process = Process.Start(psi)
            ?? throw new InvalidOperationException("Failed to start git.");
        var stdout = process.StandardOutput.ReadToEnd();
        var stderr = process.StandardError.ReadToEnd();
        process.WaitForExit();
        if (process.ExitCode != 0)
            throw new InvalidOperationException($"git {string.Join(' ', args)} failed: {stderr}");
        return stdout;
    }
}
