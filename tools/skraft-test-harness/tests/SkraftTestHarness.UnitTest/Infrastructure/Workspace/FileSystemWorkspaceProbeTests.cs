using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Infrastructure.Workspace;

namespace SkraftTestHarness.UnitTest.Infrastructure.Workspace;

/// <summary>
/// RED: filesystem adapter for <c>IWorkspaceProbe</c>, rooted on the
/// run's working directory. Backs the workspace assertions
/// (file_exists / file_matches_glob / file_contains) and exposes the
/// matched files' contents for the LLM file_judge.
/// </summary>
public sealed class FileSystemWorkspaceProbeTests
{
    [Test]
    public async Task Exists_ShouldFindAFileRelativeToTheRoot()
    {
        using var root = new TempDir();
        root.Write("output.txt", "hello");

        var probe = new FileSystemWorkspaceProbe(root.Path);

        await Assert.That(probe.Exists(new FilePath("output.txt"))).IsTrue();
        await Assert.That(probe.Exists(new FilePath("missing.txt"))).IsFalse();
    }

    [Test]
    public async Task AnyMatches_ShouldMatchNestedDatedArtefactsWithGlobs()
    {
        using var root = new TempDir();
        root.Write(".copilot-tracking/skraft-plans/order-discount/reviews/2026-06-12/deliver-review-1.md", "x");

        var probe = new FileSystemWorkspaceProbe(root.Path);

        await Assert.That(probe.AnyMatches(
            new GlobPattern(".copilot-tracking/skraft-plans/*/reviews/*/deliver-review-*.md"))).IsTrue();
        await Assert.That(probe.AnyMatches(
            new GlobPattern(".copilot-tracking/skraft-plans/*/reviews/*/discover-review-*.md"))).IsFalse();
    }

    [Test]
    public async Task AnyMatchContains_ShouldFindTextInsideAMatchedFile()
    {
        using var root = new TempDir();
        root.Write("reviews/2026-06-12/deliver-review-1.md", "# Review\n\n**Verdict:** APPROVED\n");

        var probe = new FileSystemWorkspaceProbe(root.Path);

        await Assert.That(probe.AnyMatchContains(
            new GlobPattern("reviews/**/deliver-review-*.md"),
            new Needle("Verdict:** APPROVED"))).IsTrue();
        await Assert.That(probe.AnyMatchContains(
            new GlobPattern("reviews/**/deliver-review-*.md"),
            new Needle("Verdict:** REJECTED"))).IsFalse();
    }

    [Test]
    public async Task ReadMatching_ShouldReturnRelativePathsAndContents()
    {
        using var root = new TempDir();
        root.Write("adrs/adr-001.md", "# ADR 001");
        root.Write("adrs/adr-002.md", "# ADR 002");
        root.Write("adrs/notes.txt", "not an adr");

        var probe = new FileSystemWorkspaceProbe(root.Path);
        var files = probe.ReadMatching(new GlobPattern("adrs/adr-*.md"));

        await Assert.That(files.Keys).Contains("adrs/adr-001.md");
        await Assert.That(files.Keys).Contains("adrs/adr-002.md");
        await Assert.That(files.Keys.Count).IsEqualTo(2);
        await Assert.That(files["adrs/adr-001.md"]).Contains("# ADR 001");
    }

    private sealed class TempDir : IDisposable
    {
        public string Path { get; } = Directory.CreateTempSubdirectory("skraft-probe-test").FullName;

        public void Write(string relativePath, string contents)
        {
            var full = System.IO.Path.Combine(Path, relativePath);
            Directory.CreateDirectory(System.IO.Path.GetDirectoryName(full)!);
            File.WriteAllText(full, contents);
        }

        public void Dispose()
        {
            try { Directory.Delete(Path, recursive: true); } catch { /* best-effort */ }
        }
    }
}
