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
La revue adverse détecte *après* ; les hooks détectent *avant*.

## La solution — le harness de hooks

SKRAFT cible les événements de Claude Code et Copilot CLI ; les limites de validation
par client figurent ci-dessous. Chaque hook intercepte un événement
(`PreToolUse`, `SubagentStop`, …), évalue le payload normalisé, et retourne une décision
(`allow`, `deny`, `block`, `additionalContext`).

```
Runtime du harness
      │
      ▼  PreToolUse (outil: bash, tool_input: …)
 hook.mjs ──► normalise(payload) ──► router ──► handler
                                                    │
                                          ┌─────────┤
                                        allow     deny / block
                                          │             │
                                          └──► toHarnessOutput(décision, événement)
                                                    │
                                      exécution     bloqué
```

Ce vocabulaire de décision appartient à SKRAFT — aucun harness ne le comprend. Il est
traduit à la sortie par `harness-output.mjs` vers le JSON que les runtimes valident
réellement : un refus avant un outil voyage en `permissionDecision: "deny"`, un refus sur
tout autre événement en `decision: "block"`, et un `allow` en aucune sortie du tout. Une
seule enveloppe porte à la fois les clés racine que lit Copilot et le bloc
`hookSpecificOutput` que lit Claude Code.

La traduction n'est pas cosmétique : une décision écrite dans le vocabulaire interne échoue
à la validation du schéma harness à la racine, le payload entier est jeté, et la garde
devient un no-op qui laisse passer la violation. Voir
[Hooks — référence]({{ "/fr/reference/infrastructure/hooks" | relative_url }}) pour le format
de fil exact.

L'application du garde-fou exige que l'hôte charge le hook et respecte sa décision.
Une réponse traduite `deny` ou `block` ne prouve pas à elle seule le blocage par l'hôte.

## Structure du framework

Le framework est dans `plugins/skraft-framework/src/` à la racine du repo :

```
plugins/skraft-framework/src/
  domain/                ← politiques pures (aucune IO)
    pipeline-policy.mjs        ordre de dispatch, provenance, continuation (G1, G6)
    skill-policy.mjs           skills obligatoires, chargements lus dans un transcript (G2, G3)
    phase-gate-policy.mjs      règles de clôture de phase (G4, G5)
    session-guard-policy.mjs   protection de l'état suivi, écritures DELIVER (G7, G8)
    state-machine.mjs          transitions qu'applique le CLI d'état
    result.mjs, value-objects.mjs, …

  ports/                 ← contrats JSDoc (duck-typing)
    api/                 interfaces entrantes des hooks
    infrastructure/      interfaces sortantes (audit, état, transcript…)

  application/           ← un service par préoccupation de hook
    pre-tool-use-composite.mjs   G1, provenance et G7/G8, combinés en fail-closed
    subagent-start-service.mjs   G2
    subagent-stop-service.mjs    G3
    post-tool-use-service.mjs    trace G3, G6
    state-service.mjs, phase-gate-service.mjs   le CLI d'état et sa porte

  adapters/
    api/hooks/           ← frontière avec le harness
      harness-input.mjs  payload harness → payload du framework
      harness-output.mjs décision → format de fil harness
      hook-router.mjs    routage par événement
    infrastructure/      ← implémentations sortantes
      jsonl-audit-writer.mjs   append-only, jamais truncate
      audit-log-resolver.mjs   un journal d'audit par projet, dans son répertoire git
      json-state-reader.mjs, state/json-state-writer.mjs
      …

  cli/
    hook.mjs             entrée des hooks : stdin JSON → router → stdout JSON
    housekeeping.mjs     entrée de SessionStart
    state.mjs            seul écrivain de state.json
```

## Packaging courant et limites de validation

Les hooks du plugin installé partagent une source canonique, livrée sur deux surfaces physiques :

| Surface | Rôle |
|---|---|
| [Hooks racine](https://github.com/SebastienDegodez/skraft-plugin/blob/main/plugins/skraft-framework/hooks/hooks.json) | Source canonique et compatibilité Claude |
| [Hooks du namespace Copilot](https://github.com/SebastienDegodez/skraft-plugin/blob/main/plugins/skraft-framework/com.github.copilot/hooks/hooks.json) | Copie générée exacte octet pour octet pour Copilot v1 |

Aucun pointeur `hooks` supplémentaire dans les manifestes n'est nécessaire. Les deux surfaces
invoquent le runtime partagé via `CLAUDE_PLUGIN_ROOT` ; ce sont des adaptateurs de distribution,
pas des logiques de garde-fous distinctes. Le manifeste racine canonique déclare Agent Plugins v1
sans liste `agents` racine. Exactement deux arbres d'exécution éditables sont distribués :
31 fichiers Copilot `.agent.md` à plat dans `com.github.copilot/agents/` et 31 fichiers Claude
natifs `.md` à plat dans `com.anthropic.claude-code/agents/`. Corps et description se synchronisent
dans les deux sens contre un baseline par client ; les destinations Markdown sont traduites sans modifier les en-têtes natifs.
`npm run plugin:sync` (`--apply`) et `npm run plugin:check` (`--check`) synchronisent et vérifient
la paire. Les éditions contradictoires bloquent toute écriture. Les deux arbres, le baseline et
la copie générée des hooks sont commités car les installations marketplace depuis Git ne lancent aucun build.

Les fixtures sur **Copilot CLI 1.0.83 réel** ont **réussi** la découverte des agents namespacés,
`SessionStart` et `PreToolUse` avec `CLAUDE_PLUGIN_ROOT`, y compris des chemins contenant des espaces.
[scripts/copilot-hook-smoke.mjs](https://github.com/SebastienDegodez/skraft-plugin/blob/main/scripts/copilot-hook-smoke.mjs)
a aussi **réussi** sur le plugin migré courant installé depuis le checkout marketplace local,
avec la CLI exacte **1.0.83** épinglée via `--cli` et un `COPILOT_HOME` isolé :
**PASS allowed** (1 entrée d'audit de hook), **PASS denied** (1 entrée d'audit de hook), écriture
interdite absente. Ce refus SKRAFT observé ne valide ni le sélecteur complet des six racines
ni l'invocation de sous-agents masqués. Le code source
réel de **VS Code 1.126** utilise actuellement le repli `.plugin` puis `.claude-plugin` ; la
validation v1 complète en session réelle reste **non vérifiée**. Aucun de ces résultats ne justifie
une garantie globale de compatibilité ni l'ancien contournement sans schéma.

Sources : [générateur d'adaptateurs](https://github.com/SebastienDegodez/skraft-plugin/blob/main/scripts/project-plugin-adapters.mjs),
[sonde de compatibilité CLI](https://github.com/SebastienDegodez/skraft-plugin/blob/main/scripts/copilot-plugin-compat-smoke.mjs)
et [notes de packaging courant](https://github.com/SebastienDegodez/skraft-plugin/blob/main/plugins/skraft-framework/README.md#harness-packaging).
[ADR-009](https://github.com/SebastienDegodez/skraft-plugin/blob/main/docs/adr/adr-009-generated-copilot-hook-copy.md)
consigne le packaging courant. [ADR-008](https://github.com/SebastienDegodez/skraft-plugin/blob/main/docs/adr/adr-008-single-hook-manifest.md),
qu'il remplace, conserve les mesures historiques ; ce n'est pas une référence du packaging actuel entre clients.

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

| Garde | Appliquée par | Mode d'échec | Preuve en session réelle |
|-------|---------------|--------------|--------------------------|
| G1 ordre de dispatch | Hook `PreToolUse` | Fail-closed pour un agent de phase | Aucune |
| Provenance du dispatch | Hook `PreToolUse` | Fail-open | Aucune |
| G2 skills obligatoires | Hook `SubagentStart` | Fail-open | Aucune |
| G3 chargement des skills | Hooks `PostToolUse` et `SubagentStop` | Fail-open | Aucune |
| G4 artefacts de phase | CLI d'état, à la clôture de phase | Fail-closed | Pas un hook |
| G5 verdict et commit DELIVER | CLI d'état, à la clôture de phase | Fail-closed | Pas un hook |
| G6 continuation | Hook `PostToolUse` | Fail-open | Aucune |
| G7 état suivi | Hook `PreToolUse` | Fail-closed | Dernier passage enregistré : Copilot CLI 1.0.83 a refusé une écriture shell |
| G8 écritures DELIVER | Hook `PreToolUse` | Fail-open si l'état est illisible | Aucune |

Chaque garde est couverte par des tests unitaires et d'acceptation. Une preuve en session
réelle ne vient que d'une vraie session (`scripts/copilot-hook-smoke.mjs`,
`scripts/claude-plugin-smoke.mjs`) ; les évaluations Vally ne chargent pas les hooks du plugin.

`SubagentStart` n'injecte que les skills obligatoires de l'agent qui démarre. Les règles ne
sont pas injectées : Copilot découvre nativement les règles path-scoped, et l'orchestrateur,
seul lecteur de ces règles, les charge lui-même.

## Économie de tokens — l'angle des hooks

Les hooks contribuent à l'[économie de tokens]({{ "/fr/explanation/token-economy" | relative_url }})
du pipeline sur deux leviers de la discipline Genesis.

### Enforcement déterministe = zéro token de raisonnement

Sans hook, l'agent doit *raisonner* sur chaque invariant à chaque appel d'outil :
« dois-je normaliser ce payload ? », « cet audit-writer est-il bien append-only ? ».
Chaque vérification est une chaîne de pensée produite en sortie, tour après tour.

Avec un hook `PreToolUse`, l'enforcement est **code natif** : exit 0 ou réponse JSON
`deny`/`allow`, sans aucun token de raisonnement. La décision sort du chemin du modèle.

### Préfixe stable = cache KV éligible

Parce que l'invariant est tenu par le code du hook et non ré-injecté en prose dans le
contexte à chaque tour, le **préfixe système reste stable** entre les appels. Un préfixe
stable reste éligible au cache KV — le levier qui produit la plus grande réduction de
tokens *mesurée* du pipeline. Dès qu'un invariant est réécrit dans le prompt à chaque
appel d'outil, le préfixe change et le cache rate.

> Les ratios de réduction mesurés (cache, classe de modèle) sont documentés sur la page
> [Économie de tokens]({{ "/fr/explanation/token-economy" | relative_url }}).

## Ce que les hooks ne couvrent pas

Les hooks et le CLI d'état font respecter des **invariants structurels et
comportementaux** — ordre de dispatch, présence des artefacts, verdict du reviewer,
intégrité du fichier d'état. Ils ne constituent pas un système anti-hallucination général, et deux limites
importantes doivent être énoncées explicitement.

### G2 et G3 imposent la méthode déclarée, pas la vérité

Le garde-fou G2 injecte les skills obligatoires à `SubagentStart`. G3 consigne les lectures
de skills et renvoie au travail un sous-agent dont le transcript ne montre aucun chargement
d'un skill obligatoire : un appel de l'outil skill ou une lecture de son `SKILL.md`, jamais
une simple mention. Tous deux sont fail-open si le hook échoue afin qu'une erreur interne du
runtime ne fige pas le pipeline. Ils prouvent qu'un skill a été chargé, pas que l'agent l'a
bien appliqué.

### Violations structurelles vs. hallucinations factuelles

Les hooks détectent les **hallucinations de qualité** : artefact manquant, dispatch
hors ordre, verdict ne correspondant pas au fichier écrit. Ils ne détectent pas les
**hallucinations factuelles** : une règle métier inventée par le modèle, un endpoint
d'API inexistant cité dans le code, ou une connaissance du domaine incorrecte intégrée
dans un test. La correction factuelle reste la responsabilité du reviewer humain et
des tests d'acceptation métier.

## Pour en savoir plus

- [Économie de tokens]({{ "/fr/explanation/token-economy" | relative_url }}) — les leviers Genesis et les ratios de réduction mesurés

- [Référence hooks]({{ "/fr/reference/infrastructure/hooks" | relative_url }}) — événements et gardes, porte de phase, décisions, variables d'environnement
- [Clean Architecture]({{ "/fr/explanation/clean-architecture" | relative_url }}) — couches Api → Infra → Application → Domain
