using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.Infrastructure.Workspace;

/// <summary>
/// Clones a scenario's declared workspace into an ephemeral directory — one
/// fresh clone per call, so baseline and with-skill runs never share state and
/// the committed fixture is never mutated. All clones are deleted on dispose
/// (best-effort).
///
/// Démarche (overlay) : la fixture de base (Clean Architecture) est TOUJOURS
/// copiée, puis, si un checkpoint est déclaré, ses artefacts de pipeline sont
/// SUPERPOSÉS par-dessus (le checkpoint gagne en cas de conflit). Ainsi le code
/// de base est préservé ET l'état d'avancement du pipeline est restauré.
///
/// Layout convention: <c>{root}/{fixture}</c> (base) and
/// <c>{root}/checkpoints/{checkpoint}</c> (overlay).
/// </summary>
public sealed class FixtureWorkspaceProvisioner : IDisposable
{
    private readonly string _fixturesRoot;
    private readonly List<string> _clones = [];

    public FixtureWorkspaceProvisioner(string fixturesRoot)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(fixturesRoot);
        _fixturesRoot = fixturesRoot;
    }

    /// <summary>Clones the declared source and returns the clone root.</summary>
    public string Provision(WorkspaceRequirement requirement)
    {
        ArgumentNullException.ThrowIfNull(requirement);

        // DÉMARCHE — Le scénario déclare DEUX informations dans `workspace:` :
        //   - `fixture`    : l'application de base (ex. clean-architecture-app)
        //   - `checkpoint` : l'avancement du pipeline (ex. after-design), optionnel
        // On récupère les deux depuis le Value Object du Domaine.
        string? fixtureName = null;
        string? checkpointName = null;
        requirement.WithSource((fixture, checkpoint) =>
        {
            fixtureName = fixture;
            checkpointName = checkpoint;
        });

        if (fixtureName is null)
            throw new ArgumentException("Scenario declares no workspace to provision.", nameof(requirement));

        // La fixture de base est OBLIGATOIRE : c'est la Clean Architecture que
        // l'agent doit faire évoluer. Sans elle, l'éval ne teste rien de réel.
        var fixtureSource = Path.Combine(_fixturesRoot, fixtureName);
        if (!Directory.Exists(fixtureSource))
            throw new DirectoryNotFoundException($"Workspace fixture '{fixtureSource}' does not exist.");

        // On travaille TOUJOURS dans un clone temporaire jetable : la fixture
        // committée n'est jamais modifiée, et baseline / with-skill ne partagent
        // jamais le même répertoire. Le clone est supprimé au Dispose().
        var clone = Directory.CreateTempSubdirectory("skraft-workspace-").FullName;
        _clones.Add(clone);

        // Couche 1 (base) — on copie d'abord toute la Clean Architecture.
        CopyDirectory(fixtureSource, clone);

        // Couche 2 (overlay) — si un checkpoint est déclaré, on SUPERPOSE par
        // dessus les artefacts cumulés des phases déjà jouées
        // (.copilot-tracking/skraft-plans/...). En cas de conflit de chemin, le
        // fichier du checkpoint l'emporte (overwrite: true).
        // => Résultat : la Clean Architecture est PRÉSERVÉE + l'état du pipeline
        //    est restauré, donc une phase démarre exactement là où la précédente
        //    s'est arrêtée, tout en gardant le code à faire évoluer.
        if (checkpointName is not null)
        {
            var checkpointSource = Path.Combine(_fixturesRoot, "checkpoints", checkpointName);
            if (!Directory.Exists(checkpointSource))
                throw new DirectoryNotFoundException($"Workspace checkpoint '{checkpointSource}' does not exist.");
            CopyDirectory(checkpointSource, clone, overwrite: true);
        }

        return clone;
    }

    public void Dispose()
    {
        foreach (var clone in _clones)
        {
            try
            {
                if (Directory.Exists(clone))
                    Directory.Delete(clone, recursive: true);
            }
            catch
            {
                // best-effort cleanup
            }
        }
    }

    // Copie récursive d'un répertoire vers un autre. `overwrite: true` est
    // utilisé pour la couche overlay (le checkpoint écrase les fichiers de base
    // en cas de conflit de chemin).
    //
    // Les sorties de build (`bin/`, `obj/`) sont IGNORÉES : le template de base
    // cloné reste propre quel que soit l'état local du disque (on ne veut jamais
    // refiler des binaires périmés à l'agent).
    private static readonly string[] ExcludedDirectories = ["bin", "obj"];

    private static void CopyDirectory(string source, string destination, bool overwrite = false)
    {
        // 1) On recrée d'abord l'arborescence des sous-dossiers (hors bin/obj).
        foreach (var directory in Directory.EnumerateDirectories(source, "*", SearchOption.AllDirectories))
        {
            if (IsExcluded(source, directory))
                continue;
            Directory.CreateDirectory(Path.Combine(destination, Path.GetRelativePath(source, directory)));
        }

        // 2) Puis on copie chaque fichier (hors bin/obj) en conservant son chemin relatif.
        foreach (var file in Directory.EnumerateFiles(source, "*", SearchOption.AllDirectories))
        {
            if (IsExcluded(source, file))
                continue;
            File.Copy(file, Path.Combine(destination, Path.GetRelativePath(source, file)), overwrite);
        }
    }

    // Vrai si le chemin traverse un segment exclu (bin/ ou obj/), à n'importe
    // quelle profondeur de l'arborescence.
    private static bool IsExcluded(string source, string path)
    {
        var relative = Path.GetRelativePath(source, path);
        var segments = relative.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        return segments.Any(segment => ExcludedDirectories.Contains(segment, StringComparer.OrdinalIgnoreCase));
    }
}
