# Lens `quality-gates-lens`

**Statut :** ✅ Implémenté
**Source :** [`plugins/agents/reviewer-lenses/quality-gates-lens.agent.md`](../../../plugins/agents/reviewer-lenses/quality-gates-lens.agent.md)
**Consommé par :** [`software-engineer-reviewer`](../software-engineer-reviewer.md)

## Mission

Vérifier que les *quality gates* (tests, build, analyse, mutation, commits, intégrité RED→GREEN) sont passées — **sans rien exécuter**.

Le lens lit **un seul artefact** : le journal de preuves JSON déposé par `software-engineer` à la fin de la phase COMMIT, et **falsifie chaque assertion contre l'arbre Git**. Si une assertion ne peut pas être falsifiée mécaniquement, le verdict est `inconclusive` (jamais `pass`).

## Pourquoi un observateur et non un exécuteur ?

| Approche | Problème | Solution retenue |
|---|---|---|
| Le lens lance `dotnet test` lui-même | Couplage techno (.NET / Java / Python). Le verdict dépend de l'environnement du reviewer (SDK, secrets, accès réseau). | Le **producteur** (engineer) exécute les commandes dans **son** environnement et **écrit les sorties sur disque**. |
| Le lens fait confiance à la prose de l'engineer | Le LLM peut halluciner « tests passent ✅ » sans avoir rien lancé. | Chaque preuve est un **fichier déterministe** (stdout, exit code, sha256, snapshot Git) ; le lens recalcule le hash et compare au déclaratif. |

Le bridge déterministe (Genesis truth #6) reste du côté de celui qui a déjà le contexte d'exécution. Le lens reste portable et techno-agnostique.

## Schéma de déclenchement

```mermaid
flowchart LR
    ENG[software-engineer] -->|écrit qg-{story}.json + stdout/exit/sha256/snapshots| FS[(Git tree)]
    REV[software-engineer-reviewer] -->|fan-out| L[quality-gates-lens]
    L -->|read-only| FS
    L -->|verdict + defects JSON| REV
```

## Entrées

- **Le journal de preuves** : `.copilot-tracking/skraft-plans/{projectSlug}/evidence/{date}/qg-{story}.json` (schéma `quality-gates-evidence/v1`).
- **L'arbre Git** (lecture seule via `Read` / `Glob` / `Grep`).

Le lens **ne reçoit pas** la sortie des autres lenses (cold-reader, architecture-boundaries, test-integrity). Il vit en isolation pour préserver l'indépendance des verdicts (Genesis A7).

## Gates couvertes (taxonomie figée)

| Id | Gate | Source falsifiable |
|---|---|---|
| G1 | Acceptance tests verts | `stdout_ref` + `exit_code_ref == 0` |
| G2 | Unit tests verts | idem |
| G3 | Build vert | idem |
| G4 | Analyse statique | idem |
| G5 | Architecture rules verts | idem |
| G6 | Score de mutation ≥ seuil | `metrics.mutation_score` cohérent avec `stdout_ref` |
| G7 | Aucun mock dans Domain/Application | absence dans le diff Git |
| G8 | Commits conventionnels | regex sur `commits_covered[].subject` |
| G9 | Intégrité RED→GREEN | diff `git show {red}:{path}` vs `{green}:{path}` |

## Verdict tri-état

| Condition | Verdict |
|---|---|
| Journal absent, JSON malformé, ou `$schema` non supporté | `inconclusive` |
| Référence inatteignable (`stdout_ref` 404, `sha256` ne correspond plus, snapshot ≠ `git show`) | `inconclusive` |
| Au moins un `gates[].status == "fail"` | `fail` |
| Contradiction interne (ex. `pass` avec `tests_failed > 0`) | `fail` |
| G8 regex échoue sur un commit | `fail` |
| G9 montre une ligne RED supprimée ou mutée en GREEN | `fail` (severity `blocker`) |
| Toutes les gates applicables sont `pass` et toutes les références résolvent | `pass` |

`inconclusive` n'est **jamais** équivalent à `pass`. L'absence de preuve n'est pas une preuve de succès.

## Invariants

1. **Read-only.** Le lens n'exécute jamais build / tests / mutation / commandes Git mutantes.
2. **Aucune réparation déguisée.** Un champ manquant est un défaut, pas un cas à « assouplir » pour sauver la gate.
3. **Aucune commande techno-spécifique** (`dotnet`, `mvn`, `pytest`, `npm`…) dans le corps du lens — celles-ci vivent dans les adapters `quality-gates-<tech>` (`.dotnet`, `.java`, …) chargés côté producteur.
4. **Severity contraint.** Toute valeur hors `{blocker, high, medium, low}` rend la sortie malformée et le reviewer parent traite le lens comme `inconclusive`.

## Voir aussi

- Schéma du journal : [`quality-gates-evidence-contract`](../../../plugins/skills/quality-gates-evidence-contract/SKILL.md)
- Adapter .NET : [`quality-gates-dotnet`](../../../plugins/skills/quality-gates-dotnet/SKILL.md)
- Producteur : [`software-engineer`](../software-engineer.md)
- Synthétiseur de verdicts : [`software-engineer-reviewer`](../software-engineer-reviewer.md)
