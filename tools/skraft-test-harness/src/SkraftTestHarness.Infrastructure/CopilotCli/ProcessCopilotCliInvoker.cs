using System.Diagnostics;
using System.Text;

namespace SkraftTestHarness.Infrastructure.CopilotCli;

/// <summary>
/// Real <see cref="ICopilotCliInvoker"/>: launches the <c>copilot</c>
/// executable as a child process, captures its stdout (the JSONL
/// transcript) and returns it once the process exits. Arguments are passed
/// through <see cref="ProcessStartInfo.ArgumentList"/> so no shell quoting
/// is required. On cancellation the child process is killed.
/// </summary>
public sealed class ProcessCopilotCliInvoker : ICopilotCliInvoker
{
    private readonly string _executable;

    public ProcessCopilotCliInvoker(string executable = "copilot")
    {
        _executable = string.IsNullOrWhiteSpace(executable)
            ? throw new ArgumentException("Executable must not be empty.", nameof(executable))
            : executable;
    }

    public async Task<string> InvokeAsync(CopilotCliInvocation invocation, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(invocation);

        var startInfo = new ProcessStartInfo(_executable)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        };

        foreach (var argument in invocation.Arguments)
            startInfo.ArgumentList.Add(argument);

        if (!string.IsNullOrWhiteSpace(invocation.WorkingDirectory))
            startInfo.WorkingDirectory = invocation.WorkingDirectory;

        using var process = new Process { StartInfo = startInfo };

        var stdout = new StringBuilder();
        var stderr = new StringBuilder();
        process.OutputDataReceived += (_, e) => { if (e.Data is not null) stdout.AppendLine(e.Data); };
        process.ErrorDataReceived += (_, e) => { if (e.Data is not null) stderr.AppendLine(e.Data); };

        if (!process.Start())
            throw new InvalidOperationException($"Failed to start '{_executable}'.");

        process.BeginOutputReadLine();
        process.BeginErrorReadLine();

        try
        {
            await process.WaitForExitAsync(cancellationToken);
            // WaitForExitAsync returns as soon as the process exits but async
            // OutputDataReceived handlers may still be draining buffered output.
            // The synchronous overload waits until all redirected streams are
            // fully consumed, preventing a race where stdout is read empty.
            process.WaitForExit();
        }
        catch (OperationCanceledException)
        {
            TryKill(process);
            throw;
        }

        if (process.ExitCode != 0 && stdout.Length == 0)
            throw new InvalidOperationException(
                $"'{_executable}' exited with code {process.ExitCode}: {stderr}");

        return stdout.ToString();
    }

    private static void TryKill(Process process)
    {
        try
        {
            if (!process.HasExited)
                process.Kill(entireProcessTree: true);
        }
        catch (InvalidOperationException)
        {
            // Process already gone — nothing to kill.
        }
    }
}
