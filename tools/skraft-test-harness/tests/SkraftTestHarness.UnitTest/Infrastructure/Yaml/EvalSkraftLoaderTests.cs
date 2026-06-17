using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Infrastructure.Yaml;

namespace SkraftTestHarness.UnitTest.Infrastructure.Yaml;

/// <summary>
/// The gate test mode loads its scenarios from <c>eval.skraft.yml</c>,
/// distinct from the comparative <c>eval.yaml</c>. The loader's target
/// filename is configurable so <c>evaluate</c> keeps loading
/// <c>eval.yaml</c> while <c>run-gate</c> loads <c>eval.skraft.yml</c>.
/// </summary>
public sealed class EvalSkraftLoaderTests
{
    [Test]
    public async Task LoadsScenariosFromEvalSkraftYml()
    {
        var dir = Directory.CreateTempSubdirectory("skraft-gate-loader-test").FullName;
        try
        {
            await File.WriteAllTextAsync(Path.Combine(dir, "eval.skraft.yml"), """
                scenarios:
                  - name: "Deliver gate"
                    prompt: "Run the DELIVER phase."
                    assertions:
                      - output_contains: "done"
                """);

            var scenarios = await new YamlEvalLoader("eval.skraft.yml").LoadAsync(dir, CancellationToken.None);

            await Assert.That(scenarios.Count()).IsEqualTo(1);
        }
        finally
        {
            try { Directory.Delete(dir, recursive: true); } catch { /* best-effort */ }
        }
    }

    [Test]
    public async Task DefaultLoaderIgnoresEvalSkraftYml()
    {
        var dir = Directory.CreateTempSubdirectory("skraft-gate-loader-test").FullName;
        try
        {
            await File.WriteAllTextAsync(Path.Combine(dir, "eval.skraft.yml"), """
                scenarios:
                  - name: "Deliver gate"
                    prompt: "Run the DELIVER phase."
                    assertions:
                      - output_contains: "done"
                """);

            // The default loader targets eval.yaml — eval.skraft.yml alone is invisible to it.
            await Assert.That(async () =>
                    await new YamlEvalLoader().LoadAsync(dir, CancellationToken.None))
                .Throws<FileNotFoundException>();
        }
        finally
        {
            try { Directory.Delete(dir, recursive: true); } catch { /* best-effort */ }
        }
    }
}
