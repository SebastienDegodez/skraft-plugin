namespace SkraftTestHarness.IntegrationTest.Cli;

/// <summary>
/// Disposable helper that owns a fresh temp directory for the
/// lifetime of a test and cleans it up on disposal. Keeps the E2E
/// tests free of boilerplate around <see cref="System.IO.Path.GetTempPath"/>.
/// </summary>
internal sealed class TempWorkspace : IDisposable
{
    public string Path { get; }

    public TempWorkspace()
    {
        Path = System.IO.Path.Combine(
            System.IO.Path.GetTempPath(),
            "skraft-test-harness-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path);
    }

    public void WriteEvalYaml(string contents)
        => File.WriteAllText(System.IO.Path.Combine(Path, "eval.yaml"), contents);

    /// <summary>Writes an arbitrary file (parent directories created), e.g. to fabricate fixtures/checkpoints.</summary>
    public void WriteFile(string relativePath, string contents)
    {
        var full = System.IO.Path.Combine(Path, relativePath);
        Directory.CreateDirectory(System.IO.Path.GetDirectoryName(full)!);
        File.WriteAllText(full, contents);
    }

    public void Dispose()
    {
        try
        {
            if (Directory.Exists(Path))
                Directory.Delete(Path, recursive: true);
        }
        catch
        {
            // best-effort cleanup
        }
    }
}
