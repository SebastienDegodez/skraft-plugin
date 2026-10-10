---
layout: doc
lang: fr
title: "Hooks — référence"
description: "Catalogue factuel des événements hooks SKRAFT, types de décision et config SKRAFT_*."
sidebar_position: 1
---

# Hooks — référence

## Événements hooks

| Hook | Outil | Garde | Ce qu'il impose | En cas d'échec interne |
|------|---------|-------|-----------------|------------------------|
| `SessionStart` | — | — | Exporte `SKRAFT_PLUGIN_ROOT` vers les appels Bash suivants (Claude Code, via `CLAUDE_ENV_FILE`) ; indique le chemin du plugin et le pipeline actif dans le contexte de session ; purge le journal d'audit et les signaux d'état obsolètes | Autorise |
| `SubagentStart` | — | G2 | Indique à l'agent qui démarre ses skills obligatoires (`verify` ou `eager`) ; intègre le contenu des skills `eager` ; exclut les skills `on-demand` | Autorise |
| `PreToolUse` | `Agent`, `Task` | Provenance | Aucun agent ne se dispatche lui-même ; un agent au dispatcher déclaré n'est dispatché que par lui | Autorise |
| `PreToolUse` | `Bash`, `Write`, `Edit`, `MultiEdit`, `NotebookEdit` | G7 | Aucune écriture directe dans le `state.json` d'un pipeline, son journal d'exécution ou le pointeur `.active-slug`, quelle que soit la phase | Refuse si le fichier, ou une commande shell lue comme le shell la lit, écrit ou supprime un `state.json` suivi |
| `PreToolUse` | idem | G8 | L'orchestrateur n'écrit jamais `src/` ni `tests/`, quelle que soit la phase ; un appelant que le payload ne nomme pas passe | Autorise |
| `PostToolUse` | `Read` | G3 | Chaque lecture d'un `SKILL.md` est inscrite au journal d'audit | Autorise |
| `SubagentStop` | — | G3 | Un sous-agent dont le transcript ne montre aucun chargement d'un skill obligatoire (appel de l'outil skill, ou lecture de son `SKILL.md`) est renvoyé au travail ; les skills `on-demand` ne sont pas obligatoires ; un sous-agent déjà renvoyé est laissé partir | Autorise |

G1 (ordre de dispatch), G6 (continuation) et G9 (handoff) ne sont plus des hooks : le
pipeline tourne en code (RunPipeline, ADR-010), qui vérifie G1 et G9 avant chaque dispatch et
enregistre ce que rend chaque agent. Voir `docs/run-pipeline.md` dans le dépôt.

Les deux manifestes du plugin portent les mêmes entrées, et chaque entrée exécute
`src/cli/hook.mjs` (`src/cli/housekeeping.mjs` pour `SessionStart`). Copilot CLI envoie ses
propres noms d'outils (`bash`, `create`, `str_replace`, `view`, …) ;
`adapters/api/hooks/harness-input.mjs` les traduit vers les noms ci-dessus avant toute garde. Un
lot Copilot `toolCalls` est gardé appel par appel ; un seul appel refusé refuse le lot.

Chaque événement d'outil a une seule entrée, sans matcher : VS Code ignore les matchers et
exécuterait toutes les entrées d'un événement à chaque appel d'outil. `src/cli/hook.mjs` lit
le nom de l'outil dans le payload et sort avant de charger la moindre garde quand l'appel ne
concerne aucun des outils ci-dessus.

G7 et G8 lisent une commande shell comme le shell la découpe
(`domain/shell-command-reading.mjs`) : guillemets et échappements retirés (`'state.json'`,
`"state".json`, `state\.json`), variables affectées par la ligne substituées, `cd` et
`pushd` suivis depuis le répertoire de session que donne le hook, et les commandes lancées
par `$( )`, les backquotes, `sh -c`, `eval`, `env -S`, `find -exec` et `xargs` lues aussi.
Elles reconnaissent les redirections, `tee`, les verbes qui réécrivent, suppriment ou
copient (y compris `cp -t` et une destination répertoire), `sed`, `perl` et `awk` en place,
les scripts en ligne `node -e` ou `python -c`, `git checkout`, `restore`, `rm`, `mv` et
`clean`, et `find -delete`, derrière les affectations, les mots-clés du shell et les
enveloppes avec leurs options (`sudo -u`, `env -u`, `timeout 5`…). Supprimer un répertoire
qui contient l'état suivi, ou un glob qui peut le désigner, compte. Un chemin que G7 ne
peut pas résoudre (variable ou répertoire inconnu) compte s'il finit par un nom de fichier
protégé.

Restent invisibles : les alias, les fonctions shell définies dans une commande précédente,
les scripts lancés depuis un fichier (`bash x.sh`, `source x`) et les programmes qui
écrivent le fichier d'eux-mêmes.

## Politiques de skills

| Politique | Injection G2 au démarrage | Conformité G3 à l'arrêt | Trace G3 de lecture |
|-----------|---------------------------|--------------------------|---------------------|
| `verify` | Listée comme obligatoire | Exigée | Oui |
| `eager` | Listée comme obligatoire et intégrée | Exigée | Oui |
| `on-demand` | Non injectée | Non exigée | Oui |

## Porte de phase (CLI d'état, G4/G5)

La complétude d'une phase n'est pas un hook. L'orchestrateur enregistre artefacts et
verdicts après le retour d'un sous-agent ; le contrôle a donc lieu à la clôture de la phase :
`state.mjs transition` et `state.mjs close-phase` refusent avec `PHASE_GATE` sauf si

- **G4** — chaque sortie suivie requise de la phase est enregistrée et présente sur disque ;
- **G5** — l'artefact de revue décisif est enregistré et présent, son verdict égale le verdict
  enregistré, et une phase DELIVER qui se clôt a un commit depuis son démarrage.

La porte échoue fermée : une phase qui ne peut pas être contrôlée ne se clôt pas.

## Handoff et durée via le CLI d'état

| Sous-commande | Sortie |
|---------------|--------|
| `handoff --agent <name>` | Bloc Markdown de handoff pour le prochain dispatch d'agent de phase : entrées obligatoires résolues en chemins enregistrés, entrées de contexte, artefacts en revue, revue précédente et sorties précédentes en retry |
| `timeline` | Durées par phase depuis le journal de dispatch : temps spécialiste, temps reviewer, autres sous-agents, tentatives, blocages de conformité skill et runs de mutation |

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
| `plugins/skraft-framework/src/cli/state.mjs` | CLI d'état, porte de phase, bloc de handoff et timeline compris |
| `plugins/skraft-framework/src/adapters/api/hooks/harness-input.mjs` | Payload harness → payload du framework |
| `plugins/skraft-framework/src/adapters/api/hooks/payload.mjs` | Normalisation payload |
| `plugins/skraft-framework/src/adapters/api/hooks/decision.mjs` | Constructeurs de décision (vocabulaire interne) |
| `plugins/skraft-framework/src/adapters/api/hooks/harness-output.mjs` | Décision → format de fil harness |
| `plugins/skraft-framework/src/adapters/api/hooks/hook-router.mjs` | Routage par type d'événement |
| `plugins/skraft-framework/src/application/pre-tool-use-composite.mjs` | Provenance et G7/G8 sur `PreToolUse` |
| `plugins/skraft-framework/src/domain/pipeline-policy.mjs` | Ordre de dispatch (G1, vérifié par RunPipeline), provenance |
| `plugins/skraft-framework/src/domain/handoff-policy.mjs` | Manifeste de handoff des entrées obligatoires et évaluation G9 (vérifiée par RunPipeline) |
| `plugins/skraft-framework/src/domain/session-guard-policy.mjs` | Protection de l'état suivi et écritures de l'orchestrateur dans l'espace de travail |
| `plugins/skraft-framework/src/domain/skill-policy.mjs` | Politique des skills obligatoires et `on-demand` |
| `plugins/skraft-framework/src/domain/phase-gate-policy.mjs` | Règles de clôture de phase |
| `plugins/skraft-framework/src/adapters/infrastructure/jsonl-audit-writer.mjs` | Audit append-only |

## Voir aussi

- [Garde-fous (hooks)]({{ "/fr/explanation/hooks" | relative_url }}) — pourquoi les hooks existent
- [Clean Architecture]({{ "/fr/explanation/clean-architecture" | relative_url }}) — couches du framework
