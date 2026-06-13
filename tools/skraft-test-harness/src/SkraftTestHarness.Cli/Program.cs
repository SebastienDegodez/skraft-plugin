using System.CommandLine;
using SkraftTestHarness.Cli.Commands;

namespace SkraftTestHarness.Cli;

/// <summary>
/// Composition root of the <c>skraft-test-harness</c> CLI. Wires
/// sub-commands and delegates to them. Keeps I/O (Console) isolated
/// here so that <see cref="Run"/> can be exercised end-to-end from
/// tests with a captured <see cref="TextWriter"/>.
/// </summary>
public static class Program
{
    public static async Task<int> Main(string[] args)
        => await Run(args, Console.Out);

    public static async Task<int> Run(string[] args, TextWriter output)
    {
        var root = new RootCommand("skraft-test-harness — evaluate agents and skills.");
        root.Subcommands.Add(EvaluateCommand.Build(output));
        root.Subcommands.Add(ConsolidateCommand.Build(output));
        root.Subcommands.Add(RalphCommand.Build(output));
        root.Subcommands.Add(VerifyCheckpointCommand.Build(output));

        var parseResult = root.Parse(args);
        return await parseResult.InvokeAsync();
    }
}
