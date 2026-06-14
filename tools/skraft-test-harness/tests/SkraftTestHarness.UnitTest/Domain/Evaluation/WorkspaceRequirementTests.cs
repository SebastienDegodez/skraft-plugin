using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.UnitTest.Domain.Evaluation;

/// <summary>
/// RED: a scenario can declare the workspace it must run in
/// (<c>workspace: { fixture: ..., checkpoint: ... }</c>). The Domain
/// only carries the declaration; Infrastructure resolves and clones it.
/// </summary>
public sealed class WorkspaceRequirementTests
{
    [Test]
    public async Task ScenarioWithoutWorkspace_ShouldDeclareNoRequirement()
    {
        var scenario = Scenario.Create("A", "x", [new OutputContains(new Needle("x"))]);

        var sources = new List<string>();
        scenario.WithWorkspace((fixture, baseline, checkpoint) => sources.Add($"{fixture}|{baseline}|{checkpoint}"));

        await Assert.That(sources).IsEmpty();
    }

    [Test]
    public async Task ScenarioWithFixture_ShouldExposeFixtureAndNoCheckpoint()
    {
        var scenario = Scenario.Create(
            "A", "x",
            tags: [],
            workspace: WorkspaceRequirement.FromFixture("clean-architecture-app", checkpoint: null),
            assertions: [new OutputContains(new Needle("x"))]);

        var sources = new List<string>();
        scenario.WithWorkspace((fixture, baseline, checkpoint) => sources.Add($"{fixture}|{baseline ?? "-"}|{checkpoint ?? "-"}"));

        await Assert.That(sources).Contains("clean-architecture-app|-|-");
    }

    [Test]
    public async Task ScenarioWithCheckpoint_ShouldExposeBoth()
    {
        var scenario = Scenario.Create(
            "A", "x",
            tags: [],
            workspace: WorkspaceRequirement.FromFixture("clean-architecture-app", "after-discover"),
            assertions: [new OutputContains(new Needle("x"))]);

        var sources = new List<string>();
        scenario.WithWorkspace((fixture, baseline, checkpoint) => sources.Add($"{fixture}|{baseline ?? "-"}|{checkpoint}"));

        await Assert.That(sources).Contains("clean-architecture-app|-|after-discover");
    }

    [Test]
    public async Task ScenarioWithBaseline_ShouldExposeTheThreeLayers()
    {
        var scenario = Scenario.Create(
            "A", "x",
            tags: [],
            workspace: WorkspaceRequirement.FromFixture(
                "clean-architecture-app", baseline: "promotion-stacking/baseline", checkpoint: "promotion-stacking/after-discover"),
            assertions: [new OutputContains(new Needle("x"))]);

        var sources = new List<string>();
        scenario.WithWorkspace((fixture, baseline, checkpoint) => sources.Add($"{fixture}|{baseline}|{checkpoint}"));

        await Assert.That(sources).Contains("clean-architecture-app|promotion-stacking/baseline|promotion-stacking/after-discover");
    }
}
