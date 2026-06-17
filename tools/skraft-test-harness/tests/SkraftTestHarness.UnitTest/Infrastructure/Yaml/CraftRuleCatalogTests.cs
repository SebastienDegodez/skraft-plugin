using SkraftTestHarness.Infrastructure.Yaml;

namespace SkraftTestHarness.UnitTest.Infrastructure.Yaml;

/// <summary>
/// The <see cref="CraftRuleCatalog"/> is the extensibility seam: it
/// resolves a parsed rule into a Domain rule by matching the keys it
/// carries. Adding a kind is a single registration; an unrecognised rule
/// must fail loudly rather than pass silently.
/// </summary>
public sealed class CraftRuleCatalogTests
{
    [Test]
    public async Task ResolvesAContainsRule()
    {
        var rule = new Dictionary<string, object>(StringComparer.Ordinal)
        {
            ["id"] = "interface-in-app-or-domain",
            ["glob"] = "**/Application/**/I*.cs",
            ["contains"] = "interface",
        };

        var resolved = CraftRuleCatalog.Default().Resolve("S", rule);

        await Assert.That(resolved).IsNotNull();
    }

    [Test]
    public async Task RejectsARuleWithoutId()
    {
        var rule = new Dictionary<string, object>(StringComparer.Ordinal)
        {
            ["glob"] = "**/*.cs",
            ["contains"] = "x",
        };

        await Assert.That(() => CraftRuleCatalog.Default().Resolve("S", rule))
            .Throws<ArgumentException>();
    }

    [Test]
    public async Task RejectsAnUnknownRuleKind()
    {
        var rule = new Dictionary<string, object>(StringComparer.Ordinal)
        {
            ["id"] = "mystery",
            ["unsupported_key"] = "value",
        };

        await Assert.That(() => CraftRuleCatalog.Default().Resolve("S", rule))
            .Throws<ArgumentException>();
    }
}
