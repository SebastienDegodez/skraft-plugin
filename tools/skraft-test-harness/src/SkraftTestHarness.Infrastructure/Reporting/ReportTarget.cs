namespace SkraftTestHarness.Infrastructure.Reporting;

/// <summary>
/// Sink descriptor for the <see cref="JsonReporter"/>. Models a target
/// directory as a small VO around the path string and exposes only
/// behaviour: it resolves concrete file paths and ensures the directory
/// exists.
/// </summary>
public sealed class ReportTarget
{
    private readonly string _directory;

    private ReportTarget(string directory)
    {
        if (string.IsNullOrWhiteSpace(directory))
            throw new ArgumentException("directory must not be empty.", nameof(directory));
        _directory = directory;
    }

    public static ReportTarget Directory(string path) => new(path);

    internal string ResolveFilePath(string baseFileName)
    {
        System.IO.Directory.CreateDirectory(_directory);
        return Path.Combine(_directory, baseFileName);
    }
}
