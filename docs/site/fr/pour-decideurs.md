---
layout: default
lang: fr
title: "Pour les décideurs"
persona: manager
---

# Pour les décideurs

## Situation

Les équipes livrent avec des LLM. La vitesse est là — les développeurs produisent du code plus vite qu'avant.

## Complication

Sans discipline imposée, l'IA produit du code plausible mais non vérifié. La couverture de tests est déclarative, les revues sont superficielles, et la dette technique s'accumule silencieusement.

> « The only way to go fast is to go well. »
> — Martin, R. C., *Clean Architecture*, 2017.

## Question

Comment cadrer l'IA pour que la vitesse de livraison se traduise en valeur livrée ?

## Réponse — Les 3 leviers SKRAFT

### 1. Discipline imposable

Chaque phase du pipeline applique le principe CQS : l'agent exécuteur écrit, le reviewer vérifie. Aucun agent ne valide son propre travail. Les invariants sont vérifiés automatiquement avant chaque transition de phase.

### 2. Métriques de qualité empiriques

SKRAFT mesure le Mutation Score, pas la couverture déclarative. Un test qui ne détecte pas de mutation est un test qui ne protège rien.

> « Software delivery performance predicts organizational performance and profitability. »
> — Forsgren, N., Humble, J. & Kim, G., *Accelerate*, 2018.

### 3. Vitesse sans dette cachée

Le Walking Skeleton valide l'architecture de bout en bout avant d'écrire la moindre logique métier. L'Outside-In TDD garantit que chaque ligne de code est guidée par un test d'acceptation.

> « High performers spend less time on unplanned work and rework, freeing capacity for new value. »
> — Forsgren, N., Humble, J. & Kim, G., *Accelerate*, 2018.

## ROI mesurable — Métriques DORA

| Métrique | Sans pipeline | Avec SKRAFT |
|---|---|---|
| Change Failure Rate | Élevé — bugs découverts en production | Réduit — validé par Mutation Score avant merge |
| MTTR | Lent — diagnostic manuel | Rapide — traçabilité issue → test → code |
| Deployment Frequency | Freiné par la peur de casser | Accéléré — chaque commit est vérifié |

> « If you only quantify one thing, quantify the cost of delay. »
> — Reinertsen, D. G., *The Principles of Product Development Flow*, 2009.

## Ce que SKRAFT requiert

- **2 à 3 jours de formation** pour l'équipe sur la méthodologie et les agents.
- **Un sponsor identifié** qui porte l'adoption et arbitre les résistances.
- **Le respect des invariants** — les garde-fous du pipeline ne sont pas négociables (voir §5.3).
