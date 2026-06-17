using System.CommandLine;
using SkraftTestHarness.Application.Gateways;
using SkraftTestHarness.Application.VerifyCheckpoint;
using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Infrastructure.Workspace;
using SkraftTestHarness.Infrastructure.Yaml;

namespace SkraftTestHarness.Cli.Commands;

/// <summary>
/// <c>verify-checkpoint</c> sub-command: the checkpoint conformance
/// contract. Evaluates ONLY the file assertions of an eval suite
/// against the committed fixtures/checkpoints — no agent run, no LLM —
/// so CI catches checkpoints drifting from what the previous phase is
/// supposed to produce. Exit 0 when conformant, 1 otherwise.
/// </summary>
public static class VerifyCheckpointCommand
{
    public static Command Build(TextWriter output)
    {
        var command = new Command(
            "verify-checkpoint",
            "Verify committed checkpoints against the file assertions of an eval suite (no agent, no LLM).");

        var testsDirOption = new Option<string>("--tests-dir")
        {
            Description = "Directory containing the eval.yaml scenario file.",
            Required = true,
        };
        var fixturesRootOption = new Option<string?>("--fixtures-root")
        {
            Description = "Root directory containing fixtures and checkpoints/. Default: ./fixtures.",
        };
        var tagsOption = new Option<string?>("--tags")
        {
            Description = "Comma-separated tags; only scenarios carrying ALL of them are verified.",
        };

        command.Options.Add(testsDirOption);
        command.Options.Add(fixturesRootOption);
        command.Options.Add(tagsOption);

        command.SetAction(async (parseResult, cancellationToken) =>
        {
            var testsDir = parseResult.GetValue(testsDirOption)!;
            var fixturesRoot = parseResult.GetValue(fixturesRootOption)
                ?? Path.Combine(Directory.GetCurrentDirectory(), "fixtures");

            IScenarioLoader loader = new YamlEvalLoader();
            VerifyCheckpointReport report;
            try
            {
                var scenarios = await loader.LoadAsync(testsDir, cancellationToken);
                scenarios = scenarios.SelectByTags(TagFilter.Parse(parseResult.GetValue(tagsOption)));

                using var workspaces = new FixtureScenarioWorkspaces(fixturesRoot);
                report = new VerifyCheckpointHandler(workspaces).Handle(scenarios);
            }
            catch (Exception ex)
            {
                await output.WriteLineAsync($"verification failed: {ex.Message}");
                return 1;
            }

            foreach (var line in report.Lines)
                await output.WriteLineAsync(line);

            if (report.IsConformant)
            {
                await output.WriteLineAsync("checkpoints conformant");
                return 0;
            }

            await output.WriteLineAsync("checkpoint drift detected");
            return 1;
        });

        return command;
    }
}
