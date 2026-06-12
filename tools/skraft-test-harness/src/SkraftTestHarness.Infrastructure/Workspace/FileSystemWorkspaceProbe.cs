using Microsoft.Extensions.FileSystemGlobbing;
using Microsoft.Extensions.FileSystemGlobbing.Abstractions;
using SkraftTestHarness.Application.Gateways;
using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Infrastructure.Judging;

namespace SkraftTestHarness.Infrastructure.Workspace;

/// <summary>
/// <see cref="IWorkspaceProbe"/> adapter rooted on a run's working
/// directory. Resolves the workspace assertions against the real
/// filesystem (globbing via Microsoft.Extensions.FileSystemGlobbing)
/// and exposes matched file contents for the LLM file_judge prompt.
/// </summary>
public sealed class FileSystemWorkspaceProbe : IWorkspaceProbe, IMatchedFilesReader
{
    private const long MaxReadBytesPerFile = 32 * 1024;

    private readonly string _root;

    public FileSystemWorkspaceProbe(string root)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(root);
        _root = root;
    }

    public bool Exists(FilePath path)
    {
        ArgumentNullException.ThrowIfNull(path);
        return File.Exists(Path.Combine(_root, path.ToString()));
    }

    public bool AnyMatches(GlobPattern pattern)
        => Match(pattern).Count > 0;

    public bool AnyMatchContains(GlobPattern pattern, Needle needle)
    {
        ArgumentNullException.ThrowIfNull(needle);
        var needleText = needle.ToString();
        foreach (var relativePath in Match(pattern))
        {
            if (ReadCapped(relativePath).Contains(needleText, StringComparison.Ordinal))
                return true;
        }
        return false;
    }

    /// <summary>Relative path → contents (capped) for every file matching the glob.</summary>
    public IReadOnlyDictionary<string, string> ReadMatching(GlobPattern pattern)
    {
        var files = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var relativePath in Match(pattern))
            files[relativePath] = ReadCapped(relativePath);
        return files;
    }

    private IReadOnlyList<string> Match(GlobPattern pattern)
    {
        ArgumentNullException.ThrowIfNull(pattern);
        if (!Directory.Exists(_root))
            return [];

        var matcher = new Matcher(StringComparison.Ordinal);
        matcher.AddInclude(pattern.ToString());
        var result = matcher.Execute(new DirectoryInfoWrapper(new DirectoryInfo(_root)));
        return result.Files
            .Select(f => f.Path.Replace('\\', '/'))
            .ToList();
    }

    private string ReadCapped(string relativePath)
    {
        var full = Path.Combine(_root, relativePath);
        using var stream = new FileStream(full, FileMode.Open, FileAccess.Read, FileShare.Read);
        using var reader = new StreamReader(stream);
        var buffer = new char[MaxReadBytesPerFile];
        var read = reader.ReadBlock(buffer, 0, buffer.Length);
        return new string(buffer, 0, read);
    }
}
