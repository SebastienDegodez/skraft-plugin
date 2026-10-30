---
layout: doc
lang: fr
title: "SKRAFT — Le Handbook"
description: "Ce qu'est SKRAFT V2, ce qui est disponible aujourd'hui, ce qui arrive, et où lire selon votre besoin ou votre rôle."
persona: tech-lead
---

# SKRAFT — Le Handbook

SKRAFT conduit une story à travers quatre phases : **RESEARCH → DESIGN → DISTILL → DELIVER**.
En V2, un **moteur** unique décide de tout — ordre des phases, sorties attendues, relances,
verdicts, gates — et c'est le même sous Claude Code, GitHub Copilot CLI et, bientôt, VS Code.
Les **pilotes d'hôte** exécutent ce que le moteur demande et sont les seuls à lancer des agents ;
aucun agent n'en lance un autre, et aucun hook de commande ne ralentit vos appels d'outils.

> « The only way to go fast is to go well. »
> — Martin, R. C., *Clean Architecture*, 2017.

## Première visite

Suivez le [tutoriel Premiers pas]({{ "/fr/tutorials/getting-started" | relative_url }}) : vous
installez le plugin, décrivez votre dépôt dans `skraft-config.json`, et menez une story de
RESEARCH à la description de sa pull request, sur un petit dépôt.

## Disponible aujourd'hui, et ce qui arrive

SKRAFT V2 se construit par **lots**. Chaque lot est comparé à la v1 sur les mêmes projets
d'exemple ; une régression bloque le lot.

| Lot | Capacité | État |
| --- | --- | --- |
| 0 – 2 | Phase **RESEARCH** de bout en bout (document pré-créé, relance si manquant, arrêt au plafond), journal chaîné, reprise, `skraft-config.json` à composants, détection (`skraft init`), `skraft doctor`, base par dépôt, gates lancées à la main (`skraft gate`) | Disponible |
| 3 | DESIGN, DISTILL et DELIVER conduits par le moteur sur un workflow DOT ; droits d'écriture par diff git ; gates étapes du pipeline | Disponible |
| 4 | Revue du code par lentilles isolées, réfutateur, verdict calculé, re-revue incrémentale | Disponible |
| 5 | Décisions humaines (`skraft decide`, boîtes de dialogue, boutons du panneau), ratification d'ADR | Disponible |
| 6 | Agents et skills de la v1 élagués | Disponible |
| 7 | Boucle de clôture mutation (100 % cœur, 80 % frontière) | Disponible |
| 8 | Vue du panneau, rapports de run et QA, pull request de fin de run, publication des captures, progression sur l'issue | Disponible ; affichage du Canvas Copilot dans l'app à vérifier à la main |
| 9 | Plugin `skraft-brownfield` | Disponible |
| 10 | VS Code : pilote SDK Copilot, puis repli `skraft next` / `skraft record` | Disponible |
| 11 | `skraft migrate`, `skraft review --pr`, documentation V2 ; comparaison finale v1/V2 et version 2.0.0 | `migrate` et `review --pr` disponibles ; la comparaison finale reste à faire |

Hôtes disponibles aujourd'hui : **Claude Code** (commande `/skraft`, panneau « Skraft »),
**GitHub Copilot CLI** (workflows `skraft-pipeline` et `skraft-review`) et **VS Code** (SDK
Copilot, ou boucle d'agent de `skraft-orchestrator`).

## Comment lire ce handbook

La documentation suit **Diátaxis** : quatre portes selon ce que vous cherchez.

| Porte | Pour… | Pages |
| --- | --- | --- |
| **Apprendre** (tutoriel) | faire un premier parcours guidé | [Premiers pas]({{ "/fr/tutorials/getting-started" | relative_url }}) |
| **Faire** (guide pratique) | réussir une tâche précise | [Configurer les composants]({{ "/fr/how-to/configure-components" | relative_url }}), [Lancer les gates]({{ "/fr/how-to/run-gates" | relative_url }}), [Reprendre ou débloquer un run]({{ "/fr/how-to/resume-a-run" | relative_url }}), [Customisation]({{ "/fr/how-to/customisation" | relative_url }}), [Évaluer un skill]({{ "/fr/how-to/evaluation" | relative_url }}), [Contribuer]({{ "/fr/how-to/contributing" | relative_url }}) |
| **Consulter** (référence) | retrouver un fait exact | [Hôtes]({{ "/fr/reference/hosts" | relative_url }}), [La ligne de commande `skraft`]({{ "/fr/reference/cli" | relative_url }}), [Workflow DOT]({{ "/fr/reference/workflow-dot" | relative_url }}), [Phases]({{ "/fr/reference/phases" | relative_url }}), [`skraft-config.json`]({{ "/fr/reference/skraft-config" | relative_url }}), [Journal du run]({{ "/fr/reference/run-journal" | relative_url }}), [Glossaire]({{ "/fr/reference/glossary" | relative_url }}), [Catalogue des agents et skills]({{ "/fr/dashboard/" | relative_url }}), [Gates]({{ "/fr/reference/gates" | relative_url }}) |
| **Comprendre** (explication) | savoir *pourquoi* c'est construit ainsi | [Pour décideurs]({{ "/fr/explanation/for-executives" | relative_url }}), [Architecture]({{ "/fr/explanation/architecture" | relative_url }}), [Garde-fous]({{ "/fr/explanation/guardrails" | relative_url }}), [Le journal d'événements]({{ "/fr/explanation/event-journal" | relative_url }}), [Les phases]({{ "/fr/explanation/pipeline/" | relative_url }}), [Le backlog]({{ "/fr/explanation/backlog" | relative_url }}), [Clean Architecture]({{ "/fr/explanation/clean-architecture" | relative_url }}), [Outside-In TDD]({{ "/fr/explanation/deep-dive/outside-in-tdd" | relative_url }}), [Brownfield]({{ "/fr/explanation/brownfield" | relative_url }}) |

## Où aller selon votre rôle

- **Décideur** — le problème que la V2 résout et les objectifs visés :
  [Pour décideurs]({{ "/fr/explanation/for-executives" | relative_url }}).
- **Développeur** — d'abord le [tutoriel]({{ "/fr/tutorials/getting-started" | relative_url }}),
  puis les guides : [configurer les composants]({{ "/fr/how-to/configure-components" | relative_url }}),
  [lancer les gates]({{ "/fr/how-to/run-gates" | relative_url }}),
  [reprendre ou débloquer un run]({{ "/fr/how-to/resume-a-run" | relative_url }}).
- **Architecte** — moteur, pilotes d'hôte, profondeur 1 :
  [Architecture]({{ "/fr/explanation/architecture" | relative_url }}).
- **Qualification** — où sont les preuves et comment les lire :
  [Lancer les gates]({{ "/fr/how-to/run-gates" | relative_url }}),
  [Journal du run]({{ "/fr/reference/run-journal" | relative_url }}).

## SKRAFT V2 en une image

```mermaid
flowchart LR
    H[Vous : /skraft ou workflow skraft-pipeline] --> P[Pilote d'hôte]
    P <-->|demande / résultat| M[Moteur]
    P -->|lance| A[Agent d'une phase]
    A -->|fichiers| W[Dépôt]
    M -->|vérifie sorties, lance gates| W
    M -->|écrit| J[events.jsonl]
```

Le moteur ne lance jamais d'agent ; il dit au pilote quoi lancer, vérifie ce que l'agent a écrit,
puis journalise chaque étape dans `.copilot-tracking/skraft-plans/<slug>/events.jsonl`.
