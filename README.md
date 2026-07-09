<div align="center">

# skraft

**Pipeline SDLC agentique déterministe — DISCOVER → DISCUSS → DESIGN → DISTILL → DELIVER**

Agents spécialisés, reviewers adversariaux, skills de discipline (Outside-In TDD, Clean Architecture)
et garde-fous mécaniques (hooks) portés sur **Claude Code**, **GitHub Copilot** et **Cursor**.

[![skraft-framework CI](https://github.com/SebastienDegodez/skraft-plugin/actions/workflows/skraft-framework-ci.yml/badge.svg)](https://github.com/SebastienDegodez/skraft-plugin/actions/workflows/skraft-framework-ci.yml)
[![Release](https://github.com/SebastienDegodez/skraft-plugin/actions/workflows/release.yml/badge.svg)](https://github.com/SebastienDegodez/skraft-plugin/actions/workflows/release.yml)
[![Latest release](https://img.shields.io/github/v/release/SebastienDegodez/skraft-plugin?sort=semver)](https://github.com/SebastienDegodez/skraft-plugin/releases)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg)](https://www.conventionalcommits.org/)
[![semantic-release](https://img.shields.io/badge/semantic--release-conventional-e10079?logo=semantic-release)](https://github.com/semantic-release/semantic-release)

</div>

---

## Description

**skraft** transforme un assistant de code en une **chaîne de production logicielle disciplinée**.
Chaque phase du cycle de vie est portée par un agent spécialisé, revue par un reviewer adversarial
dédié, et **verrouillée par des garde-fous déterministes** (hooks) qui bloquent — *avant* de payer
le sous-agent — tout dispatch hors-séquence, tout skill obligatoire non chargé, ou tout avancement
sans artefact réel, verdict `APPROVED` et commit git vérifié.

Le cœur runtime suit une **architecture hexagonale (Clean Architecture)** sans dépendance externe,
testée boundary-to-boundary et durcie par mutation testing.

## Fonctionnalités clés

- 🔁 **Pipeline SDLC en 5 phases** orchestré par `skraft-orchestrator` : DISCOVER → DISCUSS → DESIGN → DISTILL → DELIVER.
- 🤖 **Agents de phase spécialisés** : `backlog-discoverer`, `backlog-planner`, `solution-architect`, `acceptance-designer`, `software-engineer` — chacun avec son **reviewer adversarial** dédié.
- 🔬 **Reviewer lenses** indépendantes (quality-gates, architecture-boundaries, test-integrity, cold-reader) synthétisées en un verdict pondéré.
- 📚 **Skills de discipline** : Outside-In TDD, Clean Architecture testing, BDD/Gherkin, mutation testing, contract testing, ADR, issue refinement…
- 🛡️ **Garde-fous mécaniques G1–G8** (hooks fail-closed) : ordre de dispatch, forçage de chargement des skills + audit JSONL, vérification artefacts/verdict/commit, protection d'état.
- 🎯 **Portabilité multi-harness** : mêmes garde-fous sur Claude Code, Copilot CLI et Cursor.
- 💸 **Économie de tokens** : modèle state write-through (réhydratation 1×/session), routage de modèles par classe de coût, configurateur `depthTier` repo-wide.

## Installation

skraft est distribué comme **plugin de marketplace**. La source du plugin vit dans [`plugins/`](./plugins).

### Claude Code

```bash
# Ajouter la marketplace puis installer le plugin « skraft »
/plugin marketplace add SebastienDegodez/skraft-plugin
/plugin install skraft
```

### GitHub Copilot / Cursor

Les manifestes équivalents sont fournis (`.cursor-plugin/marketplace.json`, `.github/hooks/`).
Voir [`docs/architecture.md`](./docs/architecture.md) pour le détail du portage par harness.

## Démarrage rapide

Une fois le plugin installé, lancez le pipeline complet via l'orchestrateur :

```
/skraft
```

L'orchestrateur reprend automatiquement au dernier état persisté, gère les transitions de phase,
les verdicts reviewer (avec retry), et la boucle engineer ↔ reviewer.

## Documentation

Toute la documentation vit dans [`docs/`](./docs/).

| Sujet | Lien |
|---|---|
| 📑 Index de documentation | [`docs/README.md`](./docs/README.md) |
| 🏗️ Architecture du plugin | [`docs/architecture.md`](./docs/architecture.md) |
| 🛠️ Framework de garde-fous (hexagonal, G1–G8, ancrage genesis) | [`plugins/README.md`](./plugins/README.md) |
| 🛣️ Roadmap (13 US + statut) | [`docs/roadmap.md`](./docs/roadmap.md) |
| 🤝 Vue transverse Engineer/Reviewer | [`docs/agents/software-engineer-and-reviewer.md`](./docs/agents/software-engineer-and-reviewer.md) |
| 🎨 Conventions de documentation | [`docs/conventions.md`](./docs/conventions.md) |

## État actuel — synthèse

| Composant | Statut |
|---|---|
| Pipeline SDLC orchestrée par `skraft-orchestrator` | ✅ Implémentée |
| Agents spécialisés de phase (`backlog-*`, `solution-architect*`, `acceptance-designer*`, `software-engineer*`) | ✅ Implémentés |
| Reviewer lenses (`quality-gates`, `architecture-boundaries`, `test-integrity`, `cold-reader`) | ✅ Implémentés |
| Skills opérationnels (`plugins/skills/*`) | ✅ Implémentés |
| Garde-fous hooks G1–G5 + G4/G5 (artefacts/verdict/commit) | ✅ Implémentés |
| Garde-fous G6–G8, observabilité, recovery | 🚧 [Roadmap](./docs/roadmap.md) |

## Développement

```bash
# Tests (boundary-to-boundary, 0 dépendance runtime)
node --test tests/skraft-framework/*.test.mjs

# Mutation testing (Stryker)
npm --prefix plugins/src ci && node plugins/src/node_modules/.bin/stryker run plugins/src/stryker.config.mjs

# Vérifs de policy (config data-driven, modèles par classe de coût)
node plugins/src/cli/build-config-bin.mjs --check
node plugins/src/cli/resolve-model-bin.mjs --check
```

Les règles de placement des tests et de configuration Stryker sont décrites dans [`AGENTS.md`](./AGENTS.md).

## Versionnage & releases

Ce projet suit [**SemVer**](https://semver.org/) et publie ses releases **automatiquement** via
[**semantic-release**](https://github.com/semantic-release/semantic-release).

- Les messages de commit doivent respecter [**Conventional Commits**](https://www.conventionalcommits.org/) :
  - `feat:` → bump **minor** ; `fix:` / `perf:` / `refactor:` / `docs:` → bump **patch** ;
  - `feat!:` ou footer `BREAKING CHANGE:` → bump **major**.
- À chaque push sur `main`, le workflow [`release.yml`](./.github/workflows/release.yml) :
  1. calcule la prochaine version depuis l'historique de commits,
  2. met à jour [`CHANGELOG.md`](./CHANGELOG.md) et la version dans `plugins/.claude-plugin/plugin.json` + `plugins/src/package.json`,
  3. crée le **tag `vX.Y.Z`** et la **GitHub Release** avec les notes de version,
  4. commite le tout avec `chore(release): X.Y.Z [skip ci]`.

Consultez les [**Releases**](https://github.com/SebastienDegodez/skraft-plugin/releases) pour l'historique
des modifications par version.

## Contribuer

1. Branche depuis `main`.
2. Commits en **Conventional Commits** (indispensable pour le versionnage automatique).
3. `node --test tests/skraft-framework/*.test.mjs` doit passer.
4. Ouvrez une Pull Request — la CI vérifie tests, policy de config et modèles.

## Licence

Voir le dépôt pour les informations de licence.
