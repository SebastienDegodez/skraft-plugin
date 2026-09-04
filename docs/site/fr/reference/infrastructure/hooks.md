---
layout: doc
lang: fr
title: "Hooks — référence"
description: "Catalogue factuel des événements hooks SKRAFT, types de décision et config SKRAFT_*."
sidebar_position: 1
---

# Hooks — référence

## Événements hooks

| Hook | Déclencheur | Invariant SKRAFT associé | Statut |
|------|-------------|--------------------------|--------|
| `SessionStart` | Démarrage d'une session | Entretien et signaux d'état obsolète | ✅ Livré |
| `SubagentStart` | Démarrage d'un sous-agent | Skills obligatoires ; règles compagnes Claude (G2) | ✅ Livré |
| `PreToolUse` (`Agent`) | Avant un dispatch d'agent | Ordre des phases et garde de session (G1/G8) | ✅ Livré |
| `PreToolUse` (`Bash`) | Avant exécution d'un shell | Protection de l'état (G7) | ✅ Livré |
| `PostToolUse` (`Read`) | Après lecture d'un fichier | Audit des skills (G3) | ✅ Livré |
| `PostToolUse` (`Agent`) | Après un dispatch d'agent | Continuation de l'orchestrateur (G6) | ✅ Livré |
| `SubagentStop` | Fin d'un sous-agent | Contrôles artefact, verdict et commit (G4/G5) | ✅ Livré |

Les manifests exposent le sous-ensemble d'événements pris en charge par chaque runtime.
Toutes les entrées convergent vers la même composition root `src/cli/hook.mjs`.

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

## Config SKRAFT_* et cascade

Le config-loader (`plugins/skraft-framework/src/application/config-loader.mjs`) résout la config
selon la cascade suivante (la dernière source gagne) :

```
1. Variables d'environnement SKRAFT_*   (priorité la plus basse)
2. ~/.skraft/config.json                (config globale utilisateur)
3. .skraftrc.json ou skraft.config.json (config projet, priorité la plus haute)
```

### Clés de configuration supportées

| Variable env | Clé config | Description |
|-------------|------------|-------------|
| `SKRAFT_LOG_LEVEL` | `logLevel` | Niveau de log (`debug`, `info`, `warn`, `error`) |
| `SKRAFT_TIMEOUT` | `timeout` | Timeout en secondes |
| `SKRAFT_MODE` | `mode` | Mode d'exécution (`production`, `test`) |

*La liste est extensible — toute variable `SKRAFT_*` est convertie en clé camelCase.*

## Fichiers source

| Fichier | Rôle |
|---------|------|
| `plugins/skraft-framework/src/cli/hook.mjs` | Point d'entrée CLI (stdin → stdout) |
| `plugins/skraft-framework/src/adapters/api/hooks/payload.mjs` | Normalisation payload |
| `plugins/skraft-framework/src/adapters/api/hooks/decision.mjs` | Constructeurs de décision (vocabulaire interne) |
| `plugins/skraft-framework/src/adapters/api/hooks/harness-output.mjs` | Décision → format de fil harness |
| `plugins/skraft-framework/src/adapters/api/hooks/hook-router.mjs` | Routage par type d'événement |
| `plugins/skraft-framework/src/adapters/api/hooks/hook-entry.mjs` | Normalise puis route |
| `plugins/skraft-framework/src/adapters/api/hooks/service-factory.mjs` | Composition root |
| `plugins/skraft-framework/src/adapters/infrastructure/jsonl-audit-writer.mjs` | Audit append-only |
| `plugins/skraft-framework/src/application/config-loader.mjs` | Config cascade |
| `.github/hooks/skraft.json` | Déclaration des hooks auprès du runtime Copilot |

## Voir aussi

- [Garde-fous (hooks)]({{ "/fr/explanation/hooks" | relative_url }}) — pourquoi les hooks existent
- [Clean Architecture]({{ "/fr/explanation/clean-architecture" | relative_url }}) — couches du framework
