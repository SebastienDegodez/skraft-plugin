---
layout: doc
lang: fr
title: "skraft-difficulty-routing"
description: "Use at pipeline start to detect an upstream HVE backlog/sprint handoff (entry-point skip), and at DISCOVER exit to ev..."
persona: tech-lead
---

# skraft-difficulty-routing

> Évalue deux axes orthogonaux autour de DISCOVER — le point d'entrée (DISCOVER peut-il être sauté parce qu'un handoff HVE amont fournit déjà le backlog et le sprint ?) et le tier de difficulté (comment DELIVER s'exécute) — et persiste la décision dans `state.json` avant la transition vers DISCUSS.

## Quand l'utiliser

- Au démarrage du pipeline (Phase 0), avant DISCOVER, pour détecter un handoff HVE amont
- À la sortie de la phase DISCOVER, une seule fois par exécution de pipeline, pour évaluer la difficulté
- Lorsque DISCOVER est sauté, immédiatement après l'ingestion du handoff
- Avant toute transition vers DISCUSS
- Invoqué par l'orchestrateur SKRAFT

## Les deux axes

| Axe | Évalué | Persisté dans | Décide |
|---|---|---|---|
| Point d'entrée | Démarrage du pipeline (Phase 0) | `state.json::entryPoint` | Si DISCOVER est sauté parce qu'un handoff HVE fournit déjà un backlog trié **et** un sprint calculé |
| Difficulté | Sortie de DISCOVER | `state.json::difficulty` | Le modèle d'exécution DELIVER — TDD inline ou dispatch d'un sous-agent par scénario Gherkin |

Il n'y a pas de troisième axe. Le niveau de profondeur global au dépôt qui était routé ici a été supprimé ; `skraft-quality-bar` détient désormais chaque seuil et le niveau d'application de chaque porte, de façon permanente.

### Difficulté → modèle d'exécution DELIVER

| Difficulté | Modèle d'exécution DELIVER |
|---|---|
| `simple` | Cycle TDD inline, un seul commit par scénario |
| `medium` | Cycle TDD inline, plusieurs commits par scénario, walking skeleton |
| `medium-hard` | Dispatch d'un sous-agent par scénario Gherkin, plan intermédiaire écrit |
| `challenging` | Sous-agent par scénario, notes de spike sous `details/{date}/`, plusieurs passes de revue |

## Contrat d'entrée

- Artefacts DISCOVER validés — ou, lorsque DISCOVER est sauté, les artefacts produits par l'ingestion du handoff
- Au démarrage du pipeline, les signaux HVE candidats : issues GitHub déjà triées **et** planifiées sur un milestone ou une itération (`hve-github`), un `sprint-plan.md` sous `.copilot-tracking/workitems/sprint/{iteration}/` (`hve-ado`), ou un artefact de sprint planifié sous `.copilot-tracking/jira-issues/**` (`hve-jira`)
- Acquittement explicite de l'utilisateur pour tout handoff détecté — la détection ne saute jamais une phase d'elle-même
- `state.json` existant ou créable à la racine du plan

## Contrat de sortie

- `state.json::entryPoint` — `skipPhases`, `handoffSource`, `handoffArtifacts` ; `skipPhases` est vide par défaut, donc toutes les phases s'exécutent
- `state.json::difficulty` — modèle d'exécution DELIVER (`simple`, `medium`, `medium-hard`, `challenging`)
- Lorsque `skipPhases` contient `"DISCOVER"` — `research/{date}/triage-ingest-{date}.md` et `research/{date}/sprint-proposal.md` mappés depuis le handoff, enregistrés dans `state.json::phaseArtifacts.DISCOVER`, et confirmés présents avant que `currentPhase` ne devienne `DISCUSS`
- Résumé de routage affiché à l'utilisateur (checklist emoji ✅ valeurs retenues pour chaque axe, 🛡️ invariants actifs, ⏭️ phase sautée avec sa source de handoff)

## Invariants

- **TDD obligatoire** — au minimum Red-Green ; aucun code de production sans test échouant préalable
- **Frontières Clean Architecture** — le Domain ne dépend ni de l'Application ni de l'Infrastructure
- **Intégrité des tests** — aucun test supprimé ni désactivé pour passer GREEN
- **Conformité du schéma `state.json`** — chaque tour produit un document valide
- **Chemins datés HVE** — `research/{date}/`, `details/{date}/`, `changes/{date}/`, `reviews/{date}/` (les ADR sont globaux au projet sous `docs/adr/`, pas un chemin daté par run)
- **Reviewers en lecture seule** — ils écrivent exclusivement dans `reviews/{date}/`
- **Aucun secret ni identifiant commité**
- **Évaluation unique** — la difficulté est évaluée à la sortie de DISCOVER et jamais réévaluée en cours de pipeline
- **Toute porte bloque** — les seuils et les niveaux d'application appartiennent à `skraft-quality-bar` ; il n'existe ni niveau advisory, ni niveau warning, ni rationale qui achète une exemption
- **Le triage hérité n'est jamais recalculé** — un backlog HVE ingéré conserve ses priorités et son périmètre de sprint tels quels (pas de capacity×0.7, pas de MoSCoW, pas d'override P0)

## Pourquoi cette forme

Le routage décide *où le pipeline démarre* et *comment DELIVER s'exécute* — jamais de son niveau de rigueur. La qualité ne peut plus dériver entre les runs car aucun levier ne subsiste pour l'abaisser : la barre est permanente et identique pour tout dépôt, tout work item et toute phase. Persister les deux axes dans `state.json` rend la décision auditable et consultable par tous les agents du pipeline.

> « Clean code reads like well-written prose. »
> — Martin, R. C., *Clean Code*, 2008.

Les invariants immuables garantissent qu'aucun résultat de routage ne peut supprimer le TDD ou violer les frontières architecturales — la confiance dans le pipeline repose sur cette garantie. Sauter DISCOVER change qui a produit le backlog, pas ce que les invariants exigent des artefacts ingérés.

Le niveau de profondeur supprimé était aussi le régulateur de coût du framework : il dimensionnait le fan-out des reviewers (1 / 2 / 4), le nombre de runs de mutation et la porte Gherkin. Chaque run paie désormais la forme complète. Le propriétaire du dépôt a accepté ce coût délibérément — la qualité n'est pas négociable — et la difficulté reste le seul réglage de cette page, un réglage qui change la forme de l'exécution sans jamais abaisser la barre.

## Customisation autorisée

- Évaluation de la difficulté par work item (L1) — elle sélectionne le modèle d'exécution DELIVER, rien d'autre
- Bypass de phase via `entryPoint` lorsqu'un handoff HVE confirmé fournit déjà les artefacts requis (L2)
- Rien ici n'affaiblit une porte : aucun seuil, aucun niveau d'application et aucune exemption ne sont configurables

## Voir aussi

- [skraft-quality-bar]({{ "/fr/reference/skills/skraft-quality-bar" | relative_url }}) — Les seuils permanents et le caractère bloquant de chaque porte
- [outside-in-tdd]({{ "/fr/reference/skills/outside-in-tdd" | relative_url }}) — Cycle TDD double-boucle, la variante TDD utilisée à chaque run
- [mutation-testing]({{ "/fr/reference/skills/mutation-testing" | relative_url }}) — Exécution de mutation et classification des survivants
- [software-engineer]({{ "/fr/reference/agents/software-engineer" | relative_url }}) — Agent DELIVER qui consomme la difficulté
