using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.UnitTest.Domain.Evaluation;

/// <summary>
/// RED: scenarios carry declarative <c>tags</c> (phase, kind, …) and a
/// <see cref="TagFilter"/> selects the matching subset so a dedicated
/// category can be run alone (`--tags deliver,simulation` = AND).
/// </summary>
public sealed class ScenarioTagsTests
{
    [Test]
    public async Task EmptyFilter_ShouldKeepEveryScenario()
    {
        var scenarios = new Scenarios([
            TaggedScenario("A", "discover", "smoke"),
            TaggedScenario("B", "deliver", "simulation"),
        ]);

        var kept = scenarios.SelectByTags(TagFilter.None());

        await Assert.That(kept.Count()).IsEqualTo(2);
    }

    [Test]
    public async Task Filter_ShouldKeepOnlyScenariosCarryingAllRequestedTags()
    {
        var scenarios = new Scenarios([
            TaggedScenario("A", "deliver", "smoke"),
            TaggedScenario("B", "deliver", "simulation"),
            TaggedScenario("C", "design", "simulation"),
        ]);

        var kept = scenarios.SelectByTags(TagFilter.Parse("deliver,simulation"));

        await Assert.That(kept.Count()).IsEqualTo(1);
    }

    [Test]
    public async Task Filter_ShouldBeCaseInsensitive()
    {
        var scenarios = new Scenarios([TaggedScenario("A", "Deliver")]);

        var kept = scenarios.SelectByTags(TagFilter.Parse("deliver"));

        await Assert.That(kept.Count()).IsEqualTo(1);
    }

    [Test]
    public async Task Filter_ShouldThrowWhenNoScenarioMatches()
    {
        var scenarios = new Scenarios([TaggedScenario("A", "discover")]);

        await Assert.That(() => scenarios.SelectByTags(TagFilter.Parse("deliver")))
            .Throws<ArgumentException>();
    }

    [Test]
    public async Task UntaggedScenario_ShouldNotMatchANonEmptyFilter()
    {
        var scenarios = new Scenarios([
            Scenario.Create("Untagged", "x", [new OutputContains(new Needle("x"))]),
            TaggedScenario("Tagged", "smoke"),
        ]);

        var kept = scenarios.SelectByTags(TagFilter.Parse("smoke"));

        await Assert.That(kept.Count()).IsEqualTo(1);
    }

    private static Scenario TaggedScenario(string name, params string[] tags)
        => Scenario.Create(
            name,
            prompt: "irrelevant",
            tags,
            assertions: [new OutputContains(new Needle("x"))]);
}
