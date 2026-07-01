using System.Diagnostics;
using System.Text.Json;

namespace SkraftTestHarness.IntegrationTest.Hooks;

/// <summary>
/// Conformance guard for the guardrail hooks (US4 — G2/G3). It pins two
/// things a phase-conformance suite cannot see:
/// <list type="number">
///   <item>Both shipped manifests — the Claude Code manifest
///   (<c>plugins/hooks/hooks.json</c>, PascalCase) and the Copilot manifest
///   (<c>.github/hooks/skraft-framework.json</c>, camelCase) — declare the
///   new <c>SubagentStart</c>, <c>SubagentStop</c> and <c>PostToolUse</c>
///   events, all routed through <c>src/cli/hook.mjs</c>.</item>
///   <item>The wired hook harness actually PRODUCES a file: running the
///   <c>PostToolUse Read</c> hook on a SKILL.md read appends an audit entry
///   to the JSONL sink (the G3 tracer). This is the observable side effect
///   the manifests promise.</item>
/// </list>
/// The runtime check shells out to <c>node</c>; it self-skips when node is
/// not on PATH so a pure-.NET CI never fails spuriously.
/// </summary>
public sealed class HookManifestFileProductionTests
{
    private static readonly string[] GuardrailEvents = ["SubagentStart", "SubagentStop", "PostToolUse"];

    [Test]
    public async Task ClaudeManifestDeclaresTheGuardrailHooksRoutedThroughTheHookCli()
    {
        var repoRoot = LocateRepoRoot();
        var manifest = Path.Combine(repoRoot, "plugins", "hooks", "hooks.json");

        using var document = JsonDocument.Parse(await File.ReadAllTextAsync(manifest));
        var hooks = document.RootElement.GetProperty("hooks");

        foreach (var eventName in GuardrailEvents)
            await Assert.That(HasProperty(hooks, eventName)).IsTrue();

        var raw = await File.ReadAllTextAsync(manifest);
        await Assert.That(raw).Contains("src/cli/hook.mjs");
        // PostToolUse must carry a Read matcher — that is the G3 skill-read tracer.
        await Assert.That(raw).Contains("PostToolUse Read");
    }

    [Test]
    public async Task CopilotManifestDeclaresTheGuardrailHooksRoutedThroughTheHookCli()
    {
        var repoRoot = LocateRepoRoot();
        var manifest = Path.Combine(repoRoot, ".github", "hooks", "skraft-framework.json");

        using var document = JsonDocument.Parse(await File.ReadAllTextAsync(manifest));
        var hooks = document.RootElement.GetProperty("hooks");

        // Copilot manifest uses camelCase event keys.
        foreach (var eventName in GuardrailEvents)
            await Assert.That(HasProperty(hooks, CamelCase(eventName))).IsTrue();

        var raw = await File.ReadAllTextAsync(manifest);
        await Assert.That(raw).Contains("plugins/src/cli/hook.mjs");
        await Assert.That(raw).Contains("PostToolUse Read");
    }

    [Test]
    public async Task PostToolUseHookProducesAnAuditFileForASkillRead()
    {
        var repoRoot = LocateRepoRoot();
        var hookCli = Path.Combine(repoRoot, "plugins", "src", "cli", "hook.mjs");
        await Assert.That(File.Exists(hookCli)).IsTrue();

        var auditLog = Path.Combine(
            Path.GetTempPath(),
            "skraft-hook-audit-" + Guid.NewGuid().ToString("N"),
            "skill-audit.jsonl");

        // A PostToolUse payload for a SKILL.md read — the G3 tracer journals it.
        const string payload =
            """
            {"hookType":"PostToolUse","agentName":"solution-architect","toolInput":{"path":"plugins/skills/architecture-decisions/SKILL.md"}}
            """;

        var run = TryRunNode(repoRoot, hookCli, payload, auditLog);
        if (run is null)
            return; // node not available — skip the runtime side of the guard.

        await Assert.That(run.Value.ExitCode).IsEqualTo(0);
        await Assert.That(File.Exists(auditLog)).IsTrue();

        var journal = await File.ReadAllTextAsync(auditLog);
        await Assert.That(journal).Contains("\"eventType\":\"SkillRead\"");
        await Assert.That(journal).Contains("architecture-decisions");

        CleanUp(auditLog);
    }

    private static bool HasProperty(JsonElement element, string name)
        => element.ValueKind == JsonValueKind.Object && element.TryGetProperty(name, out _);

    private static string CamelCase(string pascal)
        => char.ToLowerInvariant(pascal[0]) + pascal[1..];

    /// <summary>
    /// Runs <c>node hook.mjs PostToolUse Read</c> with the payload on stdin and
    /// the audit sink redirected via <c>SKRAFT_AUDIT_LOG</c>. Returns null when
    /// node cannot be launched (so the caller can skip gracefully).
    /// </summary>
    private static (int ExitCode, string StdErr)? TryRunNode(
        string workingDirectory, string hookCli, string payload, string auditLog)
    {
        var startInfo = new ProcessStartInfo("node")
        {
            WorkingDirectory = workingDirectory,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        };
        startInfo.ArgumentList.Add(hookCli);
        startInfo.ArgumentList.Add("PostToolUse");
        startInfo.ArgumentList.Add("Read");
        startInfo.Environment["SKRAFT_AUDIT_LOG"] = auditLog;

        Process? process;
        try
        {
            process = Process.Start(startInfo);
        }
        catch
        {
            return null; // node not on PATH
        }

        if (process is null)
            return null;

        using (process)
        {
            process.StandardInput.Write(payload);
            process.StandardInput.Close();
            var stderr = process.StandardError.ReadToEnd();
            process.StandardOutput.ReadToEnd();
            process.WaitForExit(milliseconds: 15_000);
            return (process.ExitCode, stderr);
        }
    }

    private static void CleanUp(string auditLog)
    {
        try
        {
            var directory = Path.GetDirectoryName(auditLog);
            if (directory is not null && Directory.Exists(directory))
                Directory.Delete(directory, recursive: true);
        }
        catch
        {
            // best-effort cleanup
        }
    }

    /// <summary>Walks up from the test binary to the repo root (the dir holding <c>plugins/hooks/hooks.json</c>).</summary>
    private static string LocateRepoRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            if (File.Exists(Path.Combine(directory.FullName, "plugins", "hooks", "hooks.json")))
                return directory.FullName;
            directory = directory.Parent;
        }

        throw new DirectoryNotFoundException(
            "Could not locate the repo root (no 'plugins/hooks/hooks.json' above the test binary).");
    }
}
