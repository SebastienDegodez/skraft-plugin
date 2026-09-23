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
│   ├── plugin.json                       ← manifeste canonique v1, sans liste agents racine
│   ├── .claude-plugin/                    ← enregistrement explicite des 31 agents Claude
│   ├── com.github.copilot/
│   │   ├── agents/                        ← 31 agents éditables à plat `.agent.md`
│   │   ├── hooks/hooks.json               ← copie exacte générée du hook racine
│   │   └── rules/                         ← règles path-scoped natives
│   ├── com.anthropic.claude-code/
│   │   └── agents/                        ← 31 agents Claude natifs éditables à plat `.md`
│   ├── hooks/hooks.json                   ← source canonique, compatibilité Claude
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
| [Manifeste racine](../plugins/skraft-framework/plugin.json) | Schéma Agent Plugins v1 canonique ; aucune liste `agents` racine. | Oui. |
| [Manifeste Claude](../plugins/skraft-framework/.claude-plugin/plugin.json) | Enregistrement explicite des 31 agents, y compris workers et lenses imbriqués ; champ `rules` pour VS Code. Aucun pointeur `hooks`. | Oui, pour l'enregistrement Claude. |
| `com.anthropic.claude-code/agents/` | 31 agents Claude natifs éditables à plat ; en-têtes propres au client. | Oui, synchronisation du corps et de la description. |
| `com.github.copilot/agents/` | 31 fichiers `.agent.md` à plat ; synchronisation bidirectionnelle du contenu partagé, en-têtes client préservés. | Oui, pour les éditions synchronisées. |
| `com.github.copilot/rules/` | Règles Copilot path-scoped. | Oui. Claude reçoit seulement les règles déclarées par l'agent via `SubagentStart`. |
| [Hooks racine](../plugins/skraft-framework/hooks/hooks.json) | Source canonique ; surface de compatibilité Claude. | Oui. |
| [Hooks Copilot](../plugins/skraft-framework/com.github.copilot/hooks/hooks.json) | Copie générée exacte du manifeste de hooks racine. | Non. |

Le catalogue, la config et les évaluations scannent uniquement l'arbre Copilot :
métadonnées d'origine conservées et identités sans suffixe `.agent`.
Une source de hooks, deux surfaces physiques dans le plugin, aucun pointeur supplémentaire :
la projection ajoute un format de distribution, pas une orchestration.

Modifier l'un des deux arbres d'exécution, puis lancer `npm run plugin:sync` et
`npm run plugin:check` à la racine du repo. Ces commandes appellent
[scripts/project-plugin-adapters.mjs](../scripts/project-plugin-adapters.mjs) avec `--apply`
et `--check`. Le baseline v2 conserve les corps normalisés et descriptions précédents par
client, sous des identifiants stables ; aucun troisième arbre ni copie d'en-tête.
Les liens Markdown sont traduits vers le destinataire ; les en-têtes natifs ne sont jamais
régénérés. Un conflit bloque toute écriture. Tout nouvel agent exige ses deux versions
explicites. Commiter les deux surfaces et le baseline : les installations marketplace
depuis Git ne lancent aucun build.

Les **31 agents** doivent rester dans le manifeste Claude pour leur enregistrement et leur
délégation ; ne pas retirer les internes pour les masquer. Les flags internes
`user-invocable: false` sont conservés, mais ne sont pas documentés pour les **subagents Claude** :
aucune garantie de masquage dans son sélecteur. Les six racines autonomes destinées au public
Copilot sont `skraft-orchestrator`, `backlog-discoverer`, `backlog-planner`, `brownfield-analyst`,
`brownfield-harness-builder` et `brownfield-refactorer`.

### 1.2 Distinction `plugins/` vs `.agents/`

| Dossier | Rôle | Public |
|---|---|---|
| `plugins/skraft-framework/com.github.copilot/agents/` | Sources des personas opérationnels. | Mainteneur du plugin. |
| `plugins/skraft-framework/com.anthropic.claude-code/agents/` | Agents Claude natifs distribués. | Utilisateur final du plugin. |
| `plugins/skraft-framework/skills/` | Skills opérationnels chargés par les agents. | Agents distribués. |
| `.agents/skills/` | Skills **méta** — utilisés pour *créer* ou *maintenir* les agents/skills du plugin. | Mainteneur du plugin. |

### 1.3 Compatibilité vérifiée et limites <a id="compatibility"></a>

- **Copilot CLI 1.0.83 réel** : fixtures réussies pour les agents namespacés, `SessionStart`
  et `PreToolUse`, avec `CLAUDE_PLUGIN_ROOT`, y compris des chemins contenant des espaces.
  [scripts/copilot-hook-smoke.mjs](../scripts/copilot-hook-smoke.mjs) a aussi **réussi** sur le
  plugin migré courant installé depuis le checkout marketplace local, avec la CLI exacte
  **1.0.83** épinglée via `--cli` et un `COPILOT_HOME` isolé : **PASS allowed** (1 entrée
  d'audit de hook), **PASS denied** (1 entrée d'audit de hook), écriture interdite absente.
  Ce refus SKRAFT observé ne valide ni le sélecteur complet des six racines ni l'invocation
  de sous-agents masqués.
- **VS Code 1.126** : le code source réel utilise actuellement le repli `.plugin` puis
  `.claude-plugin`. La validation v1 complète en session réelle reste **non vérifiée**.
  Le manifeste racine conserve son `$schema` ; l'ancien contournement sans schéma n'est plus courant.
- Découverte et événements de fixture ne prouvent ni les permissions, ni les modèles, ni
  l'exécution complète du pipeline. Aucune garantie globale de compatibilité entre clients.

Ces notes et le [README distribué](../plugins/skraft-framework/README.md#harness-packaging)
décrivent le packaging courant, que consigne [ADR-009](adr/adr-009-generated-copilot-hook-copy.md).
[ADR-008](adr/adr-008-single-hook-manifest.md), qu'il remplace, conserve ses mesures historiques
sur l'ancien packaging ; ce n'est pas une preuve pour les versions actuelles.

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

Les hooks sont implémentés dans le runtime partagé. Voir le
[README distribué](../plugins/skraft-framework/README.md#runtime-guardrails) pour leurs modes
d'échec et les [limites de validation par client](#compatibility) pour le packaging courant.

---

## 6. État actuel — vue synthétique

| Composant | Présence physique | Statut |
|---|---|---|
| Orchestrateur `skraft-orchestrator` | `plugins/skraft-framework/com.github.copilot/agents/skraft-orchestrator.agent.md` | ✅ |
| Agents SDLC (10 sous-agents) | `plugins/skraft-framework/com.github.copilot/agents/*.agent.md` | ✅ |
| Reviewer lenses (4) | `plugins/skraft-framework/com.github.copilot/agents/*.agent.md` | ✅ |
| Skills opérationnels | `plugins/skraft-framework/skills/*/SKILL.md` | ✅ |
| Skill méta `create-custom-agent` | `.agents/skills/create-custom-agent/` | ✅ |
| Hooks de gardiennage | [Runtime partagé](../plugins/skraft-framework/src/cli/hook.mjs), source racine + copie Copilot | Implémentés ; [validation client limitée](#compatibility) |
