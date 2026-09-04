---
layout: doc
lang: fr
title: "Le substrat HVE-Core"
description: "HVE-Core est le substrat de reprise du pipeline d'ingénierie : state.json, écriture déterministe, projection en tâches et transitions conditionnées par les verdicts."
---

# Le substrat HVE-Core

> HVE-Core fournit au pipeline d'ingénierie sa mémoire durable (`state.json`), sa
> reprise après interruption et ses transitions conditionnées par les verdicts.

## Pourquoi un substrat

Le pipeline piloté par `skraft-orchestrator` a besoin d'un point de vérité unique :
où en est l'ingénierie, quel verdict a été rendu et combien de reprises ont eu lieu.
Sans cela, chaque agent improviserait son propre état et la reprise après interruption
serait impossible. DISCOVER, DISCUSS et les racines Brownfield restent des workflows
autonomes. Ils ne mutent pas cet état.

## `state.json` — la mémoire du pipeline

L'état persiste en JSON à
`.copilot-tracking/skraft-plans/{project-slug}/state.json`. Champs clés :

```json
{
  "currentPhase": "RESEARCH | DESIGN | DISTILL | DELIVER | DONE",
  "entryPoint": { "skipPhases": [] },
  "phaseArtifacts": { "DESIGN": ["adrs/ADR-001-...md"], "...": [] },
  "verdicts": { "DESIGN": "APPROVED | CHANGES_REQUESTED | null" },
  "retryCount": { "DESIGN": 0 },
  "userPreferences": {
    "autonomyTier": "full | partial | manual",
    "maxRetriesPerPhase": 2
  },
  "neighborPlanners": { "securityPlanFile": null, "raiPlanFile": null }
}
```

- `currentPhase` n'avance **que** sur un verdict `APPROVED`.
- `phaseArtifacts`, `verdicts`, `retryCount` tracent ce que chaque phase a
  produit et comment elle a été jugée.
- `maxRetriesPerPhase` (défaut 2) borne les reprises avant escalade humaine.
- `entryPoint` enregistre les phases que confirme un handoff HVE amont (`skipPhases`).
  Il est écrit une seule fois au démarrage du pipeline et n'est jamais révisé.

L'état ne porte **aucun dial de qualité**. Les seuils de mutation et de couverture, les
quatre lentilles de revue adverse, la porte Gherkin et la variante TDD Outside-In
double-boucle sont fixés une fois pour toutes par la skill `skraft-quality-bar` ; ils
sont identiques à chaque run, et rien de ce qui est écrit dans `state.json` ne peut les
abaisser.

## Le modèle write-through

`state.json` est un snapshot de sécurité, pas un bloc relu à chaque tour :

1. **Rehydrate** — lire et valider le snapshot une fois au début de la session.
2. **Project** — projeter les phases dans la liste de tâches native du harness.
3. **Execute** — décider depuis cette liste, puis dispatcher l'agent ou demander une décision humaine.
4. **Record** — appliquer chaque mutation par la CLI déterministe `state.mjs`.
5. **Reflect** — répercuter la mutation dans la liste de tâches sans relire tout le JSON.

## Comment les phases s'articulent

`skraft-orchestrator` est sélectionné avec une story affinée. Il séquence uniquement
RESEARCH → DESIGN → DISTILL → DELIVER. RESEARCH peut être sauté quand un handoff HVE
amont confirmé prouve qu'il est déjà satisfait ; il n'a pas de reviewer de phase déclaré. Les trois phases suivantes avancent selon
les verdicts de leurs reviewers dédiés.

```mermaid
flowchart TD
    O([skraft-orchestrator]) -->|READ / WRITE| S[(state.json)]
    O --> D1[RESEARCH si nécessaire]
    D1 --> D3[DESIGN]
    D3 --> R3{reviewer}
    R3 -->|APPROVED| D4[DISTILL]
    R3 -->|CHANGES_REQUESTED| D3
    D4 --> R4{reviewer}
    R4 -->|APPROVED| D5[DELIVER]
    R4 -->|CHANGES_REQUESTED| D4
    D5 --> R5{reviewer}
    R5 -->|APPROVED| DONE([DONE])
    R5 -->|CHANGES_REQUESTED| D5
```

Sur `CHANGES_REQUESTED`, la même phase est re-dispatchée, `retryCount` augmente et
`currentPhase` ne bouge pas. Quand le budget de reprises est atteint sans
`APPROVED`, l'orchestrateur escalade à l'utilisateur.

## Planners voisins

HVE-Core héberge d'autres planners (Security, RAI, SSSC). SKRAFT référence leurs plans
via `neighborPlanners.*` mais **n'écrit jamais** dans leur répertoire — chaque planner
reste maître de ses artefacts.

## Voir aussi

- [Traces & auditabilité](traces.html)
- [HVE → SKRAFT](hve-vs-skraft.html)
- [Architecture](architecture.html)
