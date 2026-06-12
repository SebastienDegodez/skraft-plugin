using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Infrastructure.Workspace;

namespace SkraftTestHarness.UnitTest.Infrastructure.Workspace;

/// <summary>
/// RED: clones the declared fixture (or checkpoint) into an ephemeral
/// directory per provision call, so baseline and with-skill runs never
/// share a workspace and the committed fixture is never mutated.
/// </summary>
public sealed class FixtureWorkspaceProvisionerTests
{
    [Test]
    public async Task ShouldCloneTheFixtureIntoAFreshDirectory()
    {
        using var fixtures = new TempFixtures();
        fixtures.Write("clean-architecture-app/src/Domain/Order.cs", "class Order {}");

        using var provisioner = new FixtureWorkspaceProvisioner(fixtures.Root);
        var clone = provisioner.Provision(
            WorkspaceRequirement.FromFixture("clean-architecture-app", checkpoint: null));

        await Assert.That(File.Exists(Path.Combine(clone, "src/Domain/Order.cs"))).IsTrue();
        await Assert.That(Path.GetFullPath(clone))
            .IsNotEqualTo(Path.GetFullPath(Path.Combine(fixtures.Root, "clean-architecture-app")));
    }

    [Test]
    public async Task ShouldCloneTheCheckpointWhenDeclared()
    {
        using var fixtures = new TempFixtures();
        fixtures.Write("checkpoints/after-discover/state.json", """{"currentPhase":"DISCUSS"}""");

        using var provisioner = new FixtureWorkspaceProvisioner(fixtures.Root);
        var clone = provisioner.Provision(
            WorkspaceRequirement.FromFixture("clean-architecture-app", "after-discover"));

        await Assert.That(File.Exists(Path.Combine(clone, "state.json"))).IsTrue();
    }

    [Test]
    public async Task ShouldProvisionADistinctCloneForEachCall()
    {
        using var fixtures = new TempFixtures();
        fixtures.Write("clean-architecture-app/readme.md", "x");

        using var provisioner = new FixtureWorkspaceProvisioner(fixtures.Root);
        var requirement = WorkspaceRequirement.FromFixture("clean-architecture-app", checkpoint: null);

        var baseline = provisioner.Provision(requirement);
        var withSkill = provisioner.Provision(requirement);

        await Assert.That(Path.GetFullPath(baseline)).IsNotEqualTo(Path.GetFullPath(withSkill));
    }

    [Test]
    public async Task Dispose_ShouldDeleteEveryClone()
    {
        using var fixtures = new TempFixtures();
        fixtures.Write("clean-architecture-app/readme.md", "x");

        string clone;
        using (var provisioner = new FixtureWorkspaceProvisioner(fixtures.Root))
        {
            clone = provisioner.Provision(
                WorkspaceRequirement.FromFixture("clean-architecture-app", checkpoint: null));
        }

        await Assert.That(Directory.Exists(clone)).IsFalse();
    }

    [Test]
    public async Task ShouldThrowWhenTheFixtureDoesNotExist()
    {
        using var fixtures = new TempFixtures();
        using var provisioner = new FixtureWorkspaceProvisioner(fixtures.Root);

        await Assert.That(() => provisioner.Provision(
                WorkspaceRequirement.FromFixture("missing-fixture", checkpoint: null)))
            .Throws<DirectoryNotFoundException>();
    }

    private sealed class TempFixtures : IDisposable
    {
        public string Root { get; } = Directory.CreateTempSubdirectory("skraft-fixtures-test").FullName;

        public void Write(string relativePath, string contents)
        {
            var full = Path.Combine(Root, relativePath);
            Directory.CreateDirectory(Path.GetDirectoryName(full)!);
            File.WriteAllText(full, contents);
        }

        public void Dispose()
        {
            try { Directory.Delete(Root, recursive: true); } catch { /* best-effort */ }
        }
    }
}
