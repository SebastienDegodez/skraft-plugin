using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.Infrastructure.Workspace;

/// <summary>
/// Clones a scenario's declared workspace (fixture or checkpoint) from
/// the fixtures root into an ephemeral directory — one fresh clone per
/// call, so baseline and with-skill runs never share state and the
/// committed fixture is never mutated. All clones are deleted on
/// dispose (best-effort).
/// Layout convention: <c>{root}/{fixture}</c> and
/// <c>{root}/checkpoints/{checkpoint}</c>.
/// </summary>
public sealed class FixtureWorkspaceProvisioner : IDisposable
{
    private readonly string _fixturesRoot;
    private readonly List<string> _clones = [];

    public FixtureWorkspaceProvisioner(string fixturesRoot)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(fixturesRoot);
        _fixturesRoot = fixturesRoot;
    }

    /// <summary>Clones the declared source and returns the clone root.</summary>
    public string Provision(WorkspaceRequirement requirement)
    {
        ArgumentNullException.ThrowIfNull(requirement);

        string? source = null;
        requirement.WithSource((fixture, checkpoint) =>
            source = checkpoint is null
                ? Path.Combine(_fixturesRoot, fixture)
                : Path.Combine(_fixturesRoot, "checkpoints", checkpoint));

        if (source is null)
            throw new ArgumentException("Scenario declares no workspace to provision.", nameof(requirement));
        if (!Directory.Exists(source))
            throw new DirectoryNotFoundException($"Workspace source '{source}' does not exist.");

        var clone = Directory.CreateTempSubdirectory("skraft-workspace-").FullName;
        CopyDirectory(source, clone);
        _clones.Add(clone);
        return clone;
    }

    public void Dispose()
    {
        foreach (var clone in _clones)
        {
            try
            {
                if (Directory.Exists(clone))
                    Directory.Delete(clone, recursive: true);
            }
            catch
            {
                // best-effort cleanup
            }
        }
    }

    private static void CopyDirectory(string source, string destination)
    {
        foreach (var directory in Directory.EnumerateDirectories(source, "*", SearchOption.AllDirectories))
            Directory.CreateDirectory(Path.Combine(destination, Path.GetRelativePath(source, directory)));

        foreach (var file in Directory.EnumerateFiles(source, "*", SearchOption.AllDirectories))
            File.Copy(file, Path.Combine(destination, Path.GetRelativePath(source, file)));
    }
}
