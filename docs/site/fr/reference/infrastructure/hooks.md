---
layout: doc
lang: fr
title: "Hooks — référence"
description: "Catalogue factuel des événements hooks SKRAFT, types de décision et config SKRAFT_*."
sidebar_position: 1
---

# Hooks — référence

## Événements hooks

| Hook | Matcher | Garde | Ce qu'il impose | En cas d'échec interne |
|------|---------|-------|-----------------|------------------------|
| `SessionStart` | — | — | Exporte `SKRAFT_PLUGIN_ROOT` vers les appels Bash suivants (Claude Code, via `CLAUDE_ENV_FILE`) ; indique le chemin du plugin et le pipeline actif dans le contexte de session ; purge le journal d'audit et les signaux d'état obsolètes | Autorise |
| `SubagentStart` | — | G2 | Indique à l'agent qui démarre ses skills obligatoires ; intègre le contenu des skills `eager` | Autorise |
| `PreToolUse` | `Agent`, `Task` | G1 | Un agent de phase n'est dispatché que si la phase enregistrée le permet : le spécialiste dans la phase ouverte, son reviewer une fois un artefact enregistré | Bloque, pour un agent de phase |
| `PreToolUse` | `Agent`, `Task` | Provenance | Aucun agent ne se dispatche lui-même ; un agent au dispatcher déclaré n'est dispatché que par lui | Autorise |
| `PreToolUse` | `Bash`, `Write`, `Edit`, `MultiEdit`, `NotebookEdit` | G7 | Aucune écriture directe dans le `state.json` d'un pipeline, son journal d'exécution ou le pointeur `.active-slug`, quelle que soit la phase | Refuse si le payload nomme un `state.json` suivi |
| `PreToolUse` | idem | G8 | En DELIVER, `src/` et `tests/` ne sont écrits que par les agents DELIVER et les agents qu'ils dispatchent | Autorise |
| `PostToolUse` | `Agent`, `Task` | G6 | Au retour d'un agent de phase, l'orchestrateur reçoit quoi enregistrer et quoi dispatcher ensuite | Autorise |
| `PostToolUse` | `Read` | G3 | Chaque lecture d'un `SKILL.md` est inscrite au journal d'audit | Autorise |
| `SubagentStop` | — | G3 | Un sous-agent dont le transcript ne montre aucun chargement d'un skill obligatoire (appel de l'outil skill, ou lecture de son `SKILL.md`) est renvoyé au travail ; un sous-agent déjà renvoyé est laissé partir | Autorise |

Les deux manifestes du plugin portent les mêmes entrées, et chaque entrée exécute
`src/cli/hook.mjs` (`src/cli/housekeeping.mjs` pour `SessionStart`). Copilot CLI envoie ses
propres noms d'outils (`bash`, `create`, `str_replace`, `view`, …) ;
`adapters/api/hooks/harness-input.mjs` les traduit vers les noms ci-dessus avant toute garde.

G7 et G8 lisent une commande shell à sa forme : redirections, `tee`, verbes qui réécrivent
ou copient, `sed` et `perl` en place, scripts en ligne `node -e` ou `python -c`, derrière
des affectations `VAR=valeur` et des enveloppes comme `sudo` ou `env`. Une écriture cachée
derrière `bash -c`, une variable, un sous-shell ou `find -delete` n'est pas reconnue.

## Porte de phase (CLI d'état, G4/G5)

La complétude d'une phase n'est pas un hook. L'orchestrateur enregistre artefacts et
verdicts après le retour d'un sous-agent ; le contrôle a donc lieu à la clôture de la phase :
`state.mjs transition` et `state.mjs close-phase` refusent avec `PHASE_GATE` sauf si

- **G4** — chaque sortie suivie requise de la phase est enregistrée et présente sur disque ;
- **G5** — l'artefact de revue décisif est enregistré et présent, son verdict égale le verdict
  enregistré, et une phase DELIVER qui se clôt a un commit depuis son démarrage.

La porte échoue fermée : une phase qui ne peut pas être contrôlée ne se clôt pas.

## Statut de vérification

Chaque garde ci-dessus est couverte par des tests unitaires et d'acceptation sous
`tests/skraft-framework/`. Une exécution sur un harness réel est une preuve distincte :
`scripts/copilot-hook-smoke.mjs` et `scripts/claude-plugin-smoke.mjs` pilotent une vraie
session avec une commande shell autorisée et un refus G7. Le dernier passage enregistré est
Copilot CLI 1.0.83 pour ces deux sondes ; les autres gardes n'ont aucune preuve en session
réelle, et les évaluations Vally ne chargent pas les hooks du plugin.

## Types de décision (vocabulaire interne)

Les handlers retournent l'une des quatre décisions construites par
`plugins/skraft-framework/src/adapters/api/hooks/decision.mjs` :

| Décision | Effet | Quand l'utiliser |
|----------|-------|------------------|
| `allow` | L'outil s'exécute normalement | Payload conforme, aucun invariant violé |
| `deny` | Refus non-bloquant — l'agent peut reformuler | Violation détectée, récupérable |
| `block` | Blocage immédiat — pipeline interrompu | Violation critique, irrécupérable |
| `additionalContext` | L'outil s'exécute mais l'agent reçoit un contexte supplémentaire | Avertissement ou info d'audit |

```js
allow()                                  // { decision: 'allow' }
deny('Raison du refus')                  // { decision: 'deny', message: … }
block('Raison du blocage')               // { decision: 'block', message: … }
additionalContext('Information ajoutée') // { decision: 'additionalContext', context: … }
```

**Ce vocabulaire n'atteint jamais le harness.** C'est le langage propre au framework, traduit
à la frontière du CLI par
`plugins/skraft-framework/src/adapters/api/hooks/harness-output.mjs`.

## Format de fil harness (ce qui est réellement écrit sur stdout)

Les deux harnesses typent la clé racine `decision` comme `"approve" | "block"`. Écrire
`{"decision":"allow"}` ou `{"decision":"deny"}` invalide le payload **entier** — Claude Code
journalise `Hook JSON output validation failed — (root): Invalid input`, jette la sortie et
laisse l'outil s'exécuter. Une garde qui émet le vocabulaire interne est donc inerte.

Une seule enveloppe satisfait les deux runtimes : Claude Code lit `hookSpecificOutput` et
retire les clés racine inconnues, Copilot CLI lit les clés racine et ignore
`hookSpecificOutput`.

| Décision | Événement | stdout |
|----------|-----------|--------|
| `allow` | tous | *(rien — un stdout vide n'est jamais parsé, il ne peut donc jamais échouer à la validation)* |
| `deny` / `block` | `PreToolUse` | `permissionDecision` + `permissionDecisionReason`, à la racine **et** dans `hookSpecificOutput` |
| `deny` / `block` | tout autre | `{ "decision": "block", "reason": … }` |
| `additionalContext` | tous | `additionalContext` à la racine **et** dans `hookSpecificOutput` |

```json
// deny / block sur PreToolUse — seul l'outil est refusé, la session continue
{
  "permissionDecision": "deny",
  "permissionDecisionReason": "Raison du refus",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Raison du refus"
  }
}

// deny / block sur tout autre événement
{ "decision": "block", "reason": "Raison du blocage" }

// additionalContext
{
  "additionalContext": "Information ajoutée",
  "hookSpecificOutput": { "hookEventName": "PostToolUse", "additionalContext": "Information ajoutée" }
}
```

`hookSpecificOutput.hookEventName` **doit** correspondre à l'événement en cours, sinon Claude
Code rejette le bloc. Un `block` sur `PreToolUse` est mappé sur `permissionDecision: "deny"` et
jamais sur `continue: false` : un bug de hook ne doit pas figer le pipeline.

Si le hook n'écrit rien ou exit 0 sans output, les deux runtimes interprètent comme `allow`.

## Normalisation du payload

Tous les payloads entrants sont normalisés en camelCase avant routage :

| Format entrant | Résultat |
|----------------|----------|
| `tool_name` (snake_case) | `toolName` |
| `ToolName` (PascalCase) | `toolName` |
| `toolName` (camelCase) | `toolName` (inchangé) |
| `File_Path` (mixte) | `filePath` |

Implémenté dans `plugins/skraft-framework/src/adapters/api/hooks/payload.mjs`.

## Variables d'environnement

Les hooks et les CLI lisent ces variables ; aucune n'est obligatoire.

| Variable | Effet | Défaut |
|----------|-------|--------|
| `SKRAFT_PLUGIN_ROOT` | Emplacement du plugin pour les commandes shell des agents ; exportée par `SessionStart` | Posée par le hook sur Claude Code ; indiquée dans le contexte de session sur les deux harnesses |
| `SKRAFT_PROJECT_SLUG` | Pipeline sur lequel agissent hooks et CLI | Le pointeur `.active-slug` enregistré |
| `SKRAFT_TRACKING_ROOT` | Répertoire absolu contenant l'état de chaque pipeline | `.copilot-tracking/skraft-plans` sous le répertoire de travail |
| `SKRAFT_AUDIT_LOG` | Fichier du journal d'audit | `skraft/skill-audit.jsonl` dans le répertoire git du projet, sinon `logs/` du plugin |
| `SKRAFT_CONFIG` | Config du framework (`skraft-framework.config.json`) | Celle livrée avec le runtime |
| `SKRAFT_CONFIG_ROOT` | Répertoire de la config de dépôt `skraft-config.json` | Le répertoire de travail |
| `SKRAFT_HARNESS` | Force le dialecte du payload (`claude-code` ou `copilot`) | Déduit du payload |

`src/application/config-loader.mjs` implémente une cascade `env → ~/.skraft/config.json →
.skraftrc.json`, mais aucun hook ni CLI ne la lit.

## Fichiers source

| Fichier | Rôle |
|---------|------|
| `plugins/skraft-framework/hooks/hooks.json` | Manifeste de hooks canonique |
| `plugins/skraft-framework/com.github.copilot/hooks/hooks.json` | Copie générée pour Copilot v1 |
| `plugins/skraft-framework/src/cli/hook.mjs` | Point d'entrée CLI (stdin → stdout) |
| `plugins/skraft-framework/src/cli/housekeeping.mjs` | Point d'entrée de `SessionStart` |
| `plugins/skraft-framework/src/cli/state.mjs` | CLI d'état, porte de phase comprise |
| `plugins/skraft-framework/src/adapters/api/hooks/harness-input.mjs` | Payload harness → payload du framework |
| `plugins/skraft-framework/src/adapters/api/hooks/payload.mjs` | Normalisation payload |
| `plugins/skraft-framework/src/adapters/api/hooks/decision.mjs` | Constructeurs de décision (vocabulaire interne) |
| `plugins/skraft-framework/src/adapters/api/hooks/harness-output.mjs` | Décision → format de fil harness |
| `plugins/skraft-framework/src/adapters/api/hooks/hook-router.mjs` | Routage par type d'événement |
| `plugins/skraft-framework/src/application/pre-tool-use-composite.mjs` | G1, provenance et G7/G8 sur `PreToolUse` |
| `plugins/skraft-framework/src/domain/pipeline-policy.mjs` | Ordre de dispatch, provenance, continuation |
| `plugins/skraft-framework/src/domain/session-guard-policy.mjs` | Protection de l'état suivi et écritures DELIVER |
| `plugins/skraft-framework/src/domain/phase-gate-policy.mjs` | Règles de clôture de phase |
| `plugins/skraft-framework/src/adapters/infrastructure/jsonl-audit-writer.mjs` | Audit append-only |

## Voir aussi

- [Garde-fous (hooks)]({{ "/fr/explanation/hooks" | relative_url }}) — pourquoi les hooks existent
- [Clean Architecture]({{ "/fr/explanation/clean-architecture" | relative_url }}) — couches du framework
