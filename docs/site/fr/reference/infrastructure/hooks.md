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
| `SessionStart` | Démarrage d'une session Copilot | Vérification de la config SKRAFT_* | 🚧 À venir |
| `SubagentStart` (orchestrateur) | Lancement d'un sous-agent par l'orchestrateur | Phase en ordre (G1) | 🚧 À venir |
| `SubagentStart` (worker) | Lancement d'un worker par un sous-agent | Périmètre de la tâche borné | 🚧 À venir |
| `PreToolUse` (engineer) | Avant exécution d'un outil par l'engineer | Aucun import domaine depuis Infra ; pas d'appel réseau interdit | 🚧 À venir |
| `PreToolUse` (reviewer) | Avant exécution d'un outil par le reviewer | Reviewer en lecture seule (pas de write) | 🚧 À venir |
| `PostToolUse` | Après exécution d'un outil | Audit-writer consigne en JSONL | 🚧 À venir |
| `SubagentStop` | Fin d'un sous-agent | Verdict émis avant arrêt | ✅ Scaffold |

`PreToolUse` et `SubagentStop` sont les deux événements déclarés dans
`.github/hooks/skraft.json` (scaffold US1). Les handlers métier sont à implémenter (US2+).

## Types de décision

| Décision | Effet | Quand l'utiliser |
|----------|-------|------------------|
| `allow` | L'outil s'exécute normalement | Payload conforme, aucun invariant violé |
| `deny` | Refus non-bloquant — l'agent peut reformuler | Violation détectée, récupérable |
| `block` | Blocage immédiat — pipeline interrompu | Violation critique, irrécupérable |
| `additionalContext` | L'outil s'exécute mais l'agent reçoit un contexte supplémentaire | Avertissement ou info d'audit |

### Schéma de réponse

```json
// allow
{ "decision": "allow" }
{ "decision": "allow", "message": "Payload valide" }

// deny
{ "decision": "deny", "message": "Raison du refus" }

// block
{ "decision": "block", "message": "Raison du blocage" }

// additionalContext
{ "decision": "additionalContext", "context": "Information ajoutée" }
```

Si le hook retourne `undefined` (pas de réponse) ou exit 0 sans output, le runtime
interprète comme `allow`.

## Normalisation du payload

Tous les payloads entrants sont normalisés en camelCase avant routage :

| Format entrant | Résultat |
|----------------|----------|
| `tool_name` (snake_case) | `toolName` |
| `ToolName` (PascalCase) | `toolName` |
| `toolName` (camelCase) | `toolName` (inchangé) |
| `File_Path` (mixte) | `filePath` |

Implémenté dans `plugins/src/adapters/api/hooks/payload.mjs`.

## Config SKRAFT_* et cascade

Le config-loader (`plugins/src/application/config-loader.mjs`) résout la config
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
| `plugins/src/cli/hook.mjs` | Point d'entrée CLI (stdin → stdout) |
| `plugins/src/adapters/api/hooks/payload.mjs` | Normalisation payload |
| `plugins/src/adapters/api/hooks/decision.mjs` | Constructeurs de décision |
| `plugins/src/adapters/api/hooks/hook-router.mjs` | Routage par type d'événement |
| `plugins/src/adapters/api/hooks/hook-entry.mjs` | Normalise puis route |
| `plugins/src/adapters/api/hooks/service-factory.mjs` | Composition root |
| `plugins/src/adapters/infrastructure/jsonl-audit-writer.mjs` | Audit append-only |
| `plugins/src/application/config-loader.mjs` | Config cascade |
| `.github/hooks/skraft.json` | Déclaration des hooks auprès du runtime Copilot |

## Voir aussi

- [Garde-fous (hooks)]({{ "/fr/explanation/hooks" | relative_url }}) — pourquoi les hooks existent
- [Clean Architecture]({{ "/fr/explanation/clean-architecture" | relative_url }}) — couches du framework
