---
layout: doc
lang: fr
title: "Garde-fous (hooks)"
description: "Pourquoi les hooks rendent les invariants Engineer/Reviewer mécaniquement infranchissables dans SKRAFT."
sidebar_position: 18
---

# Garde-fous — hooks SKRAFT

> « Le contrat n'a de valeur que s'il est mécaniquement infranchissable. »
> — principe directeur du framework SKRAFT

## Le problème

Dans un pipeline SDLC agentique, les invariants critiques (aucun import de domaine
depuis la couche Infra, audit-writer append-only, payload normalisé) sont documentés
dans les skills et ADR. Mais un agent peut les ignorer : rien dans le runtime ne les
fait respecter mécaniquement.

Sans garde-fous, chaque phase du pipeline expose l'invariant à la dérive silencieuse.
La revue adverse (G7) détecte *après* ; les hooks détectent *avant*.

## La solution — le harness de hooks

SKRAFT introduit un harness de hooks branché sur les événements du runtime Copilot.
Chaque hook intercepte un événement (`PreToolUse`, `SubagentStop`, …), évalue le
payload normalisé, et retourne une décision (`allow`, `deny`, `block`,
`additionalContext`).

```
Runtime Copilot
      │
      ▼  PreToolUse (outil: bash, tool_input: …)
 hook.mjs ──► normalise(payload) ──► router ──► handler
                                                    │
                                          ┌─────────┤
                                        allow     deny / block
                                          │             │
                                      exécution     bloqué
```

L'agent reçoit `deny` ou `block` avant que l'outil ne s'exécute — l'invariant ne
peut pas être violé discrètement.

## Structure du framework

Le framework est dans `plugins/src/` à la racine du repo :

```
plugins/src/
  domain/                ← invariants purs (zero dépendance)
    result.mjs           Ok/Err discriminated union
    value-objects.mjs    Phase, AgentName, ProjectSlug, Verdict
    specifications.mjs   andSpec / orSpec / notSpec
    error-codes.mjs      constantes de codes d'erreur

  ports/                 ← contrats JSDoc (duck-typing)
    api/                 interfaces entrantes (PreToolUse, SubagentStop)
    infrastructure/      interfaces sortantes (AuditWriter, Filesystem…)

  adapters/
    api/hooks/           ← point d'entrée Api
      payload.mjs        normalise camelCase / PascalCase / snake_case
      decision.mjs       allow / deny / block / additionalContext
      hook-entry.mjs     normalise + route
      hook-router.mjs    switchboard PreToolUse / SubagentStop
      service-factory.mjs composition root
    infrastructure/      ← implémentations sortantes
      jsonl-audit-writer.mjs   append-only, jamais truncate
      null-audit-writer.mjs    no-op pour les tests
      json-state-reader.mjs    lit/écrit state.json
      real-filesystem.mjs      fs node:fs/promises
      in-memory-filesystem.mjs  double de test
      system-time.mjs / fixed-time.mjs

  application/
    config-loader.mjs    cascade : env → ~/.skraft/config.json → .skraftrc.json

  cli/
    hook.mjs             CLI : stdin JSON → router → stdout JSON
```

Le runtime Copilot invoque `node plugins/src/cli/hook.mjs <HookType>` à chaque
événement déclaré dans `.github/hooks/skraft.json`.

## Exemple Starbucks (illustratif)

*Exemple illustratif — inventé pour enseigner le concept, non dérivé du codebase.*

Imaginons que le pipeline traite la story "payer une commande". L'invariant est :
*aucun appel réseau vers le service de paiement en environnement de test*.

Avec les hooks :

1. `PreToolUse` reçoit `{ toolName: "bash", tool_input: { command: "curl https://pay.starbucks.com …" } }`
2. Le handler détecte l'URL de production → retourne `deny("appel réseau interdit en CI")`
3. L'agent reçoit le refus avant exécution → reformule son approche
4. L'audit-writer consigne la tentative en JSONL append-only

Sans hook, l'appel passerait silencieusement ; la revue le découvrirait *après*.

## État d'implémentation

| Couche | Statut |
|--------|--------|
| Scaffold CA (`domain/`, `ports/`, `adapters/`, `application/`) | ✅ Livré (US1) |
| Normalisation payload (camelCase / PascalCase / snake_case) | ✅ Livré (US1) |
| Décisions (allow / deny / block / additionalContext) | ✅ Livré (US1) |
| Audit-writer JSONL append-only | ✅ Livré (US1) |
| Config-loader cascade | ✅ Livré (US1) |
| Handlers métier G1–G8 (invariants par phase) | 🚧 À venir (US2+) |

Les handlers métier (qui inspectent réellement le payload pour enforcer les
invariants SKRAFT) sont planifiés dans les user stories suivantes.

## Genesis & économie de tokens

La discipline Genesis s'applique directement au harness de hooks, sur deux axes.

### 1. `coverageAnalysis: perTest` — mutation testing 5× moins cher

Le `stryker.config.mjs` utilise `coverageAnalysis: 'perTest'`. Stryker instrumente
chaque test pour savoir quels mutants il couvre, puis n'exécute que les tests
pertinents pour chaque mutant.

Sur ce projet (183 mutants, 6 fichiers de test) :

| Métrique | Sans `perTest` | Avec `perTest` |
|----------|---------------|----------------|
| Tests exécutés par mutant | 6 (tous) | 1,14 (moyenne mesurée) |
| Exécutions totales | 183 × 6 = **1 098** | 183 × 1,14 ≈ **209** |
| **Ratio de gain** | — | **5,25× moins d'exécutions** |

*Chiffre mesuré sur le dry-run Stryker de ce projet — pas estimé.*

### 2. Enforcement déterministe = zéro token de raisonnement

Sans hook, l'agent doit *raisonner* sur chaque invariant à chaque appel d'outil :

- « Est-ce que je dois normaliser ce payload ? »
- « Est-ce que cet audit-writer est bien append-only ? »
- → ~50–200 tokens de raisonnement par outil, cumulés sur toute la session

Avec un hook `PreToolUse`, l'enforcement est **code natif** (zéro token, exit 0 ou
réponse JSON). L'agent reçoit `deny`/`allow` sans produire de chaîne de pensée sur
l'invariant.

Le gain n'est pas quantifiable sans baseline de comparaison — mais le principe est
celui du levier **"surface d'outils"** de Genesis : réduire la surface de décision
dans chaque tour raccourcit la réponse et réduit la fenêtre de contexte nécessaire.

### 3. `depthTier` et fan-out reviewer

Le `depthTier` (`basic` / `standard` / `comprehensive`) gouverne le nombre de lentilles
adversariales instanciées (1 / 2 / 4). Sur une phase DELIVER en `basic`, le hook
`SubagentStop` du reviewer n'intercepte qu'un seul verdict au lieu de quatre.
Moins de fan-out = moins de contexte rechargé = moins de tokens.

> **Règle Genesis** : un run `basic` ne doit pas coûter comme un run `comprehensive`.
> Les hooks font respecter cette règle mécaniquement — un reviewer qui tente de lancer
> 4 lentilles en `basic` reçoit `deny` avant même d'exécuter.

## Pour en savoir plus

- [Référence hooks]({{ "/fr/reference/infrastructure/hooks" | relative_url }}) — tableau des 7 événements, 4 décisions, config SKRAFT_*
- [Clean Architecture]({{ "/fr/explanation/clean-architecture" | relative_url }}) — couches Api → Infra → Application → Domain
