# Architecture du plugin `skraft`

Ce document décrit l'**organisation physique** du repo, les
**conventions de nommage** et la **mécanique de chargement** des
composants.

> **Conventions** : voir [`conventions.md`](./conventions.md).
> **Roadmap** : voir [`roadmap.md`](./roadmap.md).

---

## 1. Structure du repo

```text
skraft-plugin/
├── README.md
├── docs/                                  ← documentation (ce dossier)
│   ├── README.md
│   ├── conventions.md
│   ├── roadmap.md
│   ├── architecture.md
│   ├── agents/software-engineer-and-reviewer.md
│   ├── agents/
│   │   ├── skraft-orchestrator.md
│   │   ├── software-engineer.md
│   │   └── software-engineer-reviewer.md
│   └── skills/
│       ├── clean-architecture-testing.md
│       ├── craft-discipline.md
│       ├── create-custom-agent.md
│       └── outside-in-tdd.md
├── plugins/skraft-framework/              ← composants distribués par le plugin
│   ├── .claude-plugin/                    ← manifeste lu par Claude Code ET par VS Code
│   ├── com.github.copilot/
│   │   └── rules/                         ← règles path-scoped natives
│   ├── com.anthropic.claude-code/
│   │   ├── agents/                        ← sources canoniques `.md`
│   │   └── hooks/
│   ├── src/                               ← runtime partagé
│   └── skills/
│       ├── acceptance-review-criteria/
│       ├── architecture-decisions/
│       ├── architecture-patterns/
│       ├── architecture-review-criteria/
│       ├── bdd-methodology/
│       ├── clean-architecture-testing/
│       ├── contract-testing/
│       ├── craft-discipline/
│       ├── discovery-review-criteria/
│       ├── github-search-protocol/
│       ├── issue-refinement/
│       ├── issue-triage/
│       ├── mutation-testing/
│       ├── outside-in-tdd/
│       ├── planning-review-criteria/
│       ├── playwright-evidence/
│       ├── sprint-planning/
│       ├── test-design-mandates/
│       └── test-refactoring-catalog/
└── .agents/                               ← skills méta liés à l'authoring d'agents
    └── skills/
        └── create-custom-agent/
            └── SKILL.md
```

### 1.1 Projection par harness

| Dossier | Rôle | Source de vérité |
|---|---|---|
| `.claude-plugin/` | Manifeste de détection. Claude Code le lit nativement ; VS Code y tombe aussi, faute d'adaptateur Agent Plugins v1 capable de résoudre la racine du plugin dans une commande de hook. Il déclare les agents Claude, les règles Copilot et les hooks. | Oui, pour le routage. |
| `com.anthropic.claude-code/agents/` | Agents natifs en `.md`. Seul arbre d'agents livré. | Oui. |
| `com.github.copilot/rules/` | Règles Copilot path-scoped. | Oui. Claude reçoit seulement les règles déclarées par l'agent via `SubagentStart`. |

Le catalogue, la config et les évaluations scannent cet unique arbre : il n'y a plus de
miroir à synchroniser, donc plus d'identité à dédoublonner.

### 1.2 Distinction `plugins/` vs `.agents/`

| Dossier | Rôle | Public |
|---|---|---|
| `plugins/skraft-framework/com.anthropic.claude-code/agents/` | Agents distribués (personas opérationnels). | Utilisateur final du plugin. |
| `plugins/skraft-framework/skills/` | Skills opérationnels chargés par les agents. | Agents distribués. |
| `.agents/skills/` | Skills **méta** — utilisés pour *créer* ou *maintenir* les agents/skills du plugin. | Mainteneur du plugin. |

---

## 2. Conventions de nommage

| Type de fichier | Pattern | Exemple |
|---|---|---|
| Définition d'agent | `<nom>.md` | `software-engineer.md` |
| Définition de skill | `SKILL.md` (un par dossier de skill) | `plugins/skraft-framework/skills/outside-in-tdd/SKILL.md` |
| Référence d'un skill | `references/<sujet>.md` | `references/cqrs-patterns.md` |
| Asset d'un skill | `assets/<fichier>` | `assets/CommandHandlerTestTemplate.cs` |

### Règles

- Un dossier de skill = **un seul** `SKILL.md` à sa racine.
- Le nom du dossier est le **nom du skill** (référencé tel quel dans le
  frontmatter `name:` du `SKILL.md`).
- Le nom du fichier d'agent est le **nom de l'agent** (référencé
  tel quel dans le frontmatter `name:`).

---

## 3. Anatomie d'un agent

Un fichier d'agent se compose de :

```markdown
---
name: <nom-agent>
description: <description courte>
model: inherit
tools: <liste de tools autorisés>
metadata:
  skills:
    - <nom-skill-1>
    - <nom-skill-2>
  model_requirement: "..."
---

# <Titre>

<persona, principes, workflow, contraintes…>
```

Le frontmatter `metadata.skills` **déclare** les skills que l'agent peut
charger. Le chargement effectif se fait à l'exécution (cf. §5).

---

## 4. Anatomie d'un skill

Un `SKILL.md` se compose de :

```markdown
---
name: <nom-skill>
description: <quand l'utiliser>
---

# <Titre du skill>

<méthode, règles, exemples, anti-patterns…>
```

Conventions internes au dossier d'un skill :

- `references/` — documents annexes (patterns, stratégies, exemples
  longs) référencés depuis le `SKILL.md`.
- `assets/` — fichiers binaires ou templates de code (ex.
  `CommandHandlerTestTemplate.cs`).

---

## 5. Mécanique de chargement par l'agent

L'agent `software-engineer` distingue deux modes de chargement :

| Mode | Quand | Comportement si manquant |
|---|---|---|
| **Mandatory at startup** | Chargé avant la phase PREPARE. | Log `[SKILL MISSING] <name>` et l'agent continue. |
| **Trigger-based** | Chargé à la volée selon le déclencheur. | Idem : log et continuation. |

Voir la fiche [`agents/software-engineer.md`](./agents/software-engineer.md)
pour la matrice complète des skills consommés.

> 🚧 **À venir** — Le mécanisme de **hooks** (`SessionStart`,
> `PreToolUse`, `SubagentStart/Stop`, `PostToolUse`) qui *gardiennent*
> mécaniquement les invariants n'est pas encore implémenté. Voir
> [roadmap §2](./roadmap.md#hooks).

---

## 6. État actuel — vue synthétique

| Composant | Présence physique | Statut |
|---|---|---|
| Orchestrateur `skraft-orchestrator` | `plugins/skraft-framework/com.anthropic.claude-code/agents/skraft-orchestrator.md` | ✅ |
| Agents SDLC (10 sous-agents) | `plugins/skraft-framework/com.anthropic.claude-code/agents/*.md` | ✅ |
| Reviewer lenses (4) | `plugins/skraft-framework/com.anthropic.claude-code/agents/reviewer-lenses/*.md` | ✅ |
| Skills opérationnels | `plugins/skraft-framework/skills/*/SKILL.md` | ✅ |
| Skill méta `create-custom-agent` | `.agents/skills/create-custom-agent/` | ✅ |
| Hooks de gardiennage | — | 🚧 [roadmap §2](./roadmap.md#hooks) |
