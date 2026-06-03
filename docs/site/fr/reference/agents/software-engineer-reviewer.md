---
layout: doc
lang: fr
title: "software-engineer-reviewer"
persona: tech-lead
---

# software-engineer-reviewer

> Revoit le code et les tests de la phase DELIVER via une revue adversariale à 4 lentilles indépendantes.

## Quand l'utiliser

- Phase DELIVER (revue), après le software-engineer
- Dispatché automatiquement par l'orchestrateur
- Jamais invoqué directement par l'utilisateur

## Contrat d'entrée

- Code implémenté avec tests passants
- Mutation score calculé
- ADRs et scénarios BDD de référence

## Contrat de sortie

- Verdict : approve ou reject avec justification
- En cas de rejet, liste des problèmes par lentille de revue

## Invariants

- **Lecture seule (CQS)** — Ne modifie jamais le code qu'il revoit
- **4 lentilles adversariales** — Chaque lentille évalue indépendamment, le verdict est synthétisé
- **Verdict structuré** — Approve ou reject, pas d'état intermédiaire
- Voir [Customisation](/fr/customisation) pour la liste complète

## Pourquoi cette forme

Le reviewer DELIVER est adversarial par design. Quatre lentilles indépendantes (architecture, tests, code, métier) évaluent le livrable sans se coordonner — le verdict est une synthèse pondérée, pas un consensus.

> « Asking a question should not change the answer. »
> — Meyer, B., *Object-Oriented Software Construction, 2nd ed.*, 1997.

La multiplicité des lentilles réduit le risque de biais : un code peut passer la revue architecturale mais échouer sur la couverture de tests. Les revues par les pairs détectent des défauts que l'auteur ne voit plus.

> « Peer reviews are the single most effective technique for finding defects. »
> — Wiegers, K., *Peer Reviews in Software*, 2002.

## Customisation autorisée

- Pondération des lentilles (L2)
- Critères par lentille (L2)
- Format du verdict (L1)
- Nombre maximal de cycles reviewer (L2)

## Voir aussi

- [software-engineer](/fr/reference/agents/software-engineer) — Agent exécuteur associé
- [software-engineer-and-reviewer](/fr/reference/agents/software-engineer-and-reviewer) — Cycle complet DELIVER
- [Pipeline DELIVER](/fr/pipeline/deliver) — Description de la phase
