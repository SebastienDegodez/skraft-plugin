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
│   ├── agent-software-engineer-and-reviewer.md
│   ├── agents/
│   │   └── software-engineer.md
│   └── skills/
│       ├── outside-in-tdd.md
│       ├── red-synthesize-green.md
│       └── create-custom-agent.md
├── plugins/                               ← composants distribués par le plugin
│   ├── agents/
│   │   └── software-engineer.agent.md
│   └── skills/
│       ├── outside-in-tdd/
│       │   ├── SKILL.md
│       │   ├── assets/
│       │   │   ├── CommandHandlerTestTemplate.cs
│       │   │   └── QueryHandlerTestTemplate.cs
│       │   └── references/
│       │       ├── cqrs-patterns.md
│       │       ├── test-examples.md
│       │       └── testing-strategy.md
│       └── red-synthesize-green/
│           └── SKILL.md
└── .agents/                               ← skills méta liés à l'authoring d'agents
    └── skills/
        └── create-custom-agent/
            └── SKILL.md
```

### 1.1 Distinction `plugins/` vs `.agents/`

| Dossier | Rôle | Public |
|---|---|---|
| `plugins/agents/` | Agents distribués (personas opérationnels). | Utilisateur final du plugin. |
| `plugins/skills/` | Skills opérationnels chargés par les agents. | Agents distribués. |
| `.agents/skills/` | Skills **méta** — utilisés pour *créer* ou *maintenir* les agents/skills du plugin. | Mainteneur du plugin. |

---

## 2. Conventions de nommage

| Type de fichier | Pattern | Exemple |
|---|---|---|
| Définition d'agent | `<nom>.agent.md` | `software-engineer.agent.md` |
| Définition de skill | `SKILL.md` (un par dossier de skill) | `plugins/skills/outside-in-tdd/SKILL.md` |
| Référence d'un skill | `references/<sujet>.md` | `references/cqrs-patterns.md` |
| Asset d'un skill | `assets/<fichier>` | `assets/CommandHandlerTestTemplate.cs` |

### Règles

- Un dossier de skill = **un seul** `SKILL.md` à sa racine.
- Le nom du dossier est le **nom du skill** (référencé tel quel dans le
  frontmatter `name:` du `SKILL.md`).
- Le nom du fichier `.agent.md` est le **nom de l'agent** (référencé
  tel quel dans le frontmatter `name:`).

---

## 3. Anatomie d'un agent

Un fichier `.agent.md` se compose de :

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
> [roadmap §8](./roadmap.md#hooks).

---

## 6. État actuel — vue synthétique

| Composant | Présence physique | Statut |
|---|---|---|
| Agent `software-engineer` | `plugins/agents/software-engineer.agent.md` | ✅ |
| Skill `outside-in-tdd` (avec références + assets) | `plugins/skills/outside-in-tdd/` | ✅ |
| Skill `red-synthesize-green` | `plugins/skills/red-synthesize-green/` | ✅ |
| Skill méta `create-custom-agent` | `.agents/skills/create-custom-agent/` | ✅ |
| Agent `software-engineer-reviewer` | — | 🚧 [roadmap](./roadmap.md#reviewer) |
| Skills `quality-framework`, `clean-architecture-testing`, `test-refactoring-catalog`, `mutation-testing` | — | 🚧 [roadmap](./roadmap.md) |
| Hooks de gardiennage | — | 🚧 [roadmap §8](./roadmap.md#hooks) |
