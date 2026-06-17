using SkraftTestHarness.Domain.Evaluation;
using SkraftTestHarness.Infrastructure.Workspace;

namespace SkraftTestHarness.UnitTest.Infrastructure.Workspace;

/// <summary>
/// RED: clones the declared fixture (or checkpoint) into an ephemeral
/// directory per provision call, so baseline and with-skill runs never
/// share a workspace and the committed fixture is never mutated.
///
/// Démarche vérifiée ici :
///   - la fixture de base (Clean Architecture) est toujours clonée ;
///   - un checkpoint est SUPERPOSÉ par-dessus (overlay), ses fichiers gagnent ;
///   - chaque appel produit un clone distinct, supprimé au Dispose() ;
///   - fixture ou checkpoint manquant ⇒ DirectoryNotFoundException.
/// </summary>
public sealed class FixtureWorkspaceProvisionerTests
{
    [Test]
    public async Task ShouldNotCloneBuildOutputsSoTheTemplateStaysPristine()
    {
        using var fixtures = new TempFixtures();
        // Code source légitime du template…
        fixtures.Write("clean-architecture-app/src/Domain/Order.cs", "class Order {}");
        // …et des sorties de build qui traînent sur le disque (bin/ et obj/).
        fixtures.Write("clean-architecture-app/src/Domain/bin/Debug/Order.dll", "binary");
        fixtures.Write("clean-architecture-app/src/Domain/obj/project.assets.json", "{}");

        using var provisioner = new FixtureWorkspaceProvisioner(fixtures.Root);
        var clone = provisioner.Provision(
            WorkspaceRequirement.FromFixture("clean-architecture-app", checkpoint: null));

        // Le clone garde le code source mais JAMAIS les sorties de build :
        // le template de base reste propre quel que soit l'état local.
        await Assert.That(File.Exists(Path.Combine(clone, "src/Domain/Order.cs"))).IsTrue();
        await Assert.That(Directory.Exists(Path.Combine(clone, "src/Domain/bin"))).IsFalse();
        await Assert.That(Directory.Exists(Path.Combine(clone, "src/Domain/obj"))).IsFalse();
    }

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
    public async Task ShouldOverlayTheBaselineCodeThenTheCheckpointOnTopOfTheFixture()
    {
        using var fixtures = new TempFixtures();
        // Couche 1 : squelette vide (fixture de base).
        fixtures.Write("clean-architecture-app/src/Api/Program.cs", "// empty skeleton");
        // Couche 2 : code livré d'une histoire précédente (baseline), une seule fois.
        fixtures.Write("checkpoints/promotion-stacking/baseline/src/Domain/Order.cs", "class Order {}");
        // Couche 3 : artefacts de planification de la phase (checkpoint), sans code dupliqué.
        fixtures.Write("checkpoints/promotion-stacking/after-discover/.copilot-tracking/state.json", "{}");

        using var provisioner = new FixtureWorkspaceProvisioner(fixtures.Root);
        var clone = provisioner.Provision(
            WorkspaceRequirement.FromFixture(
                "clean-architecture-app",
                baseline: "promotion-stacking/baseline",
                checkpoint: "promotion-stacking/after-discover"));

        // Les trois couches sont présentes : squelette + code baseline + tracking.
        await Assert.That(File.Exists(Path.Combine(clone, "src/Api/Program.cs"))).IsTrue();
        await Assert.That(File.Exists(Path.Combine(clone, "src/Domain/Order.cs"))).IsTrue();
        await Assert.That(File.Exists(Path.Combine(clone, ".copilot-tracking/state.json"))).IsTrue();
    }

    [Test]
    public async Task ShouldThrowWhenTheBaselineIsDeclaredButMissing()
    {
        using var fixtures = new TempFixtures();
        fixtures.Write("clean-architecture-app/README.md", "base");

        using var provisioner = new FixtureWorkspaceProvisioner(fixtures.Root);

        await Assert.That(() => provisioner.Provision(
                WorkspaceRequirement.FromFixture(
                    "clean-architecture-app", baseline: "missing/baseline", checkpoint: null)))
            .Throws<DirectoryNotFoundException>();
    }

    [Test]
    public async Task ShouldOverlayTheCheckpointOnTopOfTheFixture()
    {
        using var fixtures = new TempFixtures();
        // Base Clean Architecture must always survive.
        fixtures.Write("clean-architecture-app/src/Domain/Order.cs", "class Order {}");
        fixtures.Write("checkpoints/after-discover/.copilot-tracking/state.json", """{"currentPhase":"DISCUSS"}""");

        using var provisioner = new FixtureWorkspaceProvisioner(fixtures.Root);
        var clone = provisioner.Provision(
            WorkspaceRequirement.FromFixture("clean-architecture-app", "after-discover"));

        // Both the CA base AND the checkpoint artefacts are present.
        await Assert.That(File.Exists(Path.Combine(clone, "src/Domain/Order.cs"))).IsTrue();
        await Assert.That(File.Exists(Path.Combine(clone, ".copilot-tracking/state.json"))).IsTrue();
    }

    [Test]
    public async Task CheckpointFileShouldWinWhenItConflictsWithTheFixture()
    {
        using var fixtures = new TempFixtures();
        fixtures.Write("clean-architecture-app/README.md", "base");
        fixtures.Write("checkpoints/after-discover/README.md", "checkpoint");

        using var provisioner = new FixtureWorkspaceProvisioner(fixtures.Root);
        var clone = provisioner.Provision(
            WorkspaceRequirement.FromFixture("clean-architecture-app", "after-discover"));

        await Assert.That(File.ReadAllText(Path.Combine(clone, "README.md"))).IsEqualTo("checkpoint");
    }

    [Test]
    public async Task ShouldThrowWhenTheCheckpointIsDeclaredButMissing()
    {
        using var fixtures = new TempFixtures();
        fixtures.Write("clean-architecture-app/README.md", "base");

        using var provisioner = new FixtureWorkspaceProvisioner(fixtures.Root);

        await Assert.That(() => provisioner.Provision(
                WorkspaceRequirement.FromFixture("clean-architecture-app", "after-nonexistent")))
            .Throws<DirectoryNotFoundException>();
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
