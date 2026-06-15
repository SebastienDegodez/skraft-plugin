using System.CommandLine;
using SkraftTestHarness.Infrastructure.Dashboard;

namespace SkraftTestHarness.Cli.Commands;

/// <summary>
/// <c>dashboard</c> sub-command: reads every harness report under
/// <c>--reports-dir</c> and folds them into a single
/// <c>dashboard-data.json</c> at <c>--out</c>, with a gates section, a
/// skill-value section, the models tested and a generation timestamp.
/// The generated file is consumed by the static handbook dashboard and
/// is never committed.
/// </summary>
public static class DashboardCommand
{
    public static Command Build(TextWriter output)
    {
        var command = new Command("dashboard", "Aggregate harness reports into dashboard-data.json.");

        var reportsDirOption = new Option<string>("--reports-dir")
        {
            Description = "Directory containing the harness JSON reports (evaluate and gate).",
            Required = true,
        };
        var outOption = new Option<string>("--out")
        {
            Description = "Path of the dashboard-data.json file to write.",
            Required = true,
        };

        command.Options.Add(reportsDirOption);
        command.Options.Add(outOption);

        command.SetAction(async (parseResult, cancellationToken) =>
        {
            var reportsDir = parseResult.GetValue(reportsDirOption)!;
            var outFile = parseResult.GetValue(outOption)!;

            try
            {
                await new DashboardDataBuilder(TimeProvider.System).BuildAsync(reportsDir, outFile, cancellationToken);
            }
            catch (Exception ex)
            {
                await output.WriteLineAsync($"dashboard failed: {ex.Message}");
                return 1;
            }

            await output.WriteLineAsync($"dashboard data written to {outFile}");
            return 0;
        });

        return command;
    }
}
