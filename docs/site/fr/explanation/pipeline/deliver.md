---
layout: doc
lang: fr
title: "DELIVER"
persona: software-engineer
---

# DELIVER

{% include phase-ribbon.html current="deliver" %}

La phase DELIVER implémente le code fonctionnel, guidé par les tests, avec une qualité vérifiée empiriquement.

## Ce qui entre, ce qui sort

| | |
|---|---|
| **Vient de** | **DISTILL** — les scénarios Gherkin + le plan |
| **Ce qui entre** | Spécifications exécutables à implémenter ; rapport prévisionnel du flux de reporting approuvé |
| **Ce qui sort** | Code testé + évidence qualité (mutation, RED→GREEN) ; rapport de résultat à la fin ou au blocage |
| **Va vers** | La **Pull Request** — revue humaine puis livraison |
| **Agent responsable** | `software-engineer` |
| **Reviewer associé** | `software-engineer-reviewer` |

## Pourquoi cette phase existe

Le code est le seul artefact qui compte en production. Le software-engineer applique l'Outside-In TDD : les Acceptance Test guident les tests unitaires, qui guident l'implémentation. Le Mutation Score vérifie que les tests protègent réellement le comportement. Le reviewer est read-only — il ne modifie jamais le code.

> « We grow working software, guided by tests, from the outside in. »
> — Freeman, S. & Pryce, N., *Growing Object-Oriented Software, Guided by Tests*, 2009.

<div class="fil-rouge" markdown="1">
<span class="fil-rouge__label">☕ Fil rouge — Starbucks <em>(exemple illustratif)</em></span>

Le scénario entre. DELIVER implémente le calcul du total et l'attribution des points en cycles **RED → GREEN**, puis un **score de mutation** atteste que les tests protègent réellement la règle de fidélité. Le code part en Pull Request.
</div>

## Ce que produit l'agent

- Code implémenté selon le cycle RED → GREEN → REFACTOR.
- Tests d'acceptation passants liés aux scénarios Gherkin.
- Tests unitaires couvrant les invariants du Domain.
- Mutation Score comme preuve empirique de la qualité des tests.

## Des preuves au rapport de résultat

**L'intégration du reporting est en cours.** Le flux approuvé transforme le rapport
prévisionnel DISTILL en comparaison avec l'impact constaté à la fin ou au blocage.
Le [software engineer]({{ "/fr/dashboard/#agent-software-engineer" | relative_url }})
possède les preuves, le journal des changements et les références d'impact.
L'[engineer reviewer]({{ "/fr/dashboard/#agent-software-engineer-reviewer" | relative_url }})
et ses lentilles existantes valident ces artefacts et possèdent le verdict canonique.
L'orchestrateur coordonne le rendu et la publication, pas la capture des preuves ni
la synthèse de revue. Aucun agent de reporting ni panel supplémentaire n'est ajouté.

Le résultat projette les tests, build, contrôles statiques, couverture, mutation,
revue, commits/fichiers et limites consignés dans du Markdown. Une preuve absente ou
périmée reste non vérifiée ; les mesures ne sont pas inventées. Un résultat bloqué
précise le travail incomplet. Les contrôles locaux des preuves et le verdict de revue
persisté restent distincts : le rendu actuel laisse la vérification des objets Git
G8/G9 au reviewer. Livré ne signifie pas déployé.

Pour le frontend, les producteurs existants capturent les preuves Playwright et les
reviewers les vérifient. Seules les preuves déjà accessibles à distance reçoivent un
lien, avec leurs limites d'accès ; les preuves locales sont explicitement indisponibles
à distance, jamais présentées comme des pièces jointes publiées. Le plafond de médias choisi
au démarrage peut être nul et n'a pas de valeur par défaut imposée. Il limite les liens
du rapport, pas les preuves locales conservées pour la revue. Les omissions restent
visibles. Aucun téléversement, hébergement ou rejeu navigateur automatique n'est ajouté
pour simplement mettre en forme le rapport.

Le résultat met à jour le second commentaire PR stable ; le rapport prévisionnel
DISTILL approuvé reste le premier. Les choix de démarrage gouvernent PR complète,
issue en mode lien, rapport complet ou aucun rapport, et résumé chat. Les destinations complètes réutilisent
le même corps rendu ; les liens d'issue sont préparés seulement après réception de
l'URL retournée du commentaire dans le reçu PR/MR correspondant.

Les scripts rendent et valident localement ; l'orchestrateur assure la publication
distante via l'hôte. Pour GitHub, le skill livré
[github-search-protocol]({{ "/fr/dashboard/#skill-github-search-protocol" | relative_url }})
possède la procédure : MCP en priorité, repli annoncé vers `gh` dans l'hôte seulement si
MCP ou une capacité requise est indisponible selon la politique du skill. Aucun skill
compagnon externe n'est requis. Azure DevOps/GitLab restent des cibles de reporting MCP
uniquement, sans prise en charge du pipeline complet.

Un reçu compare localement la relecture de l'hôte ; ce n'est **pas une vérification
réseau indépendante par les scripts**. Sans URL navigateur, les liens d'issue dépendants
restent en attente, sans permalien inventé. Les correspondances fournisseur sont testées
uniquement par des fixtures locales ; disponibilité réelle et intégration de bout en
bout via l'hôte restent non vérifiées.

En cas d'échec de publication, Markdown local, tentative en attente et reçus par
destination subsistent, même après `DONE`. La reprise réutilise les rapports enregistrés,
sans nouveau cycle d'ingénierie ni de capture. Contenu prévisionnel/résultat et responsabilité
de revue restent inchangés. Abandonner une tentative locale non résolue exige une
confirmation humaine explicite et un motif ; les reçus sont conservés et aucune écriture
distante n'est annulée.

Réutiliser le corps évite une synthèse, pas le travail de transmission ou de relecture.
Liens d'issue et résumés chat évitent de répéter les rapports complets ; aucune économie
de jetons mesurée ni aucun prix n'est annoncé.

Sources de ce protocole en cours d'intégration :
[politique de présentation](https://github.com/SebastienDegodez/skraft-plugin/blob/main/plugins/skraft-framework/src/domain/reporting-presentation.mjs),
[passage local](https://github.com/SebastienDegodez/skraft-plugin/blob/main/plugins/skraft-framework/src/application/report-publication-handoff.mjs),
[contrat de passage MCP](https://github.com/SebastienDegodez/skraft-plugin/blob/main/tests/skraft-framework/reporting/report-mcp-handoff.acceptance.test.mjs)
et [contrat d'acceptation CLI MCP](https://github.com/SebastienDegodez/skraft-plugin/blob/main/tests/skraft-framework/reporting/report-mcp-cli.acceptance.test.mjs).
Le rendu des preuves ne remplace pas la livraison guidée par les tests décrite plus haut.

## Le fan-out interne : câblage des tests

Le `software-engineer` ne câble pas les tests d'intégration à la main : il **délègue**
ce wiring à des sous-agents internes (`user-invocable: false`), un par capacité.

| Capacité | Worker | Stratégie | Lentille de fidélité |
| --- | --- | --- | --- |
| Mocking (consommateur) | `mock-integration-worker` | Microcks par défaut, surchargeable in-process | `mock-fidelity-lens` |
| Contrat (fournisseur) | `contract-testing-worker` | intégration in-process + Microcks en opt-in | `contract-fidelity-lens` |

Chaque worker n'émet que du câblage de test — le cycle TDD métier reste chez le lead,
qui vérifie le worker en **TIER-1** (le test échoue d'abord, puis passe). Quand une
capacité est active, sa lentille de fidélité rejoint le panel adverse du
`software-engineer-reviewer`. Le câblage concret est résolu par stack via un *roster*
(voir le [catalogue agentique]({{ "/fr/dashboard/" | relative_url }})).

## Les gates franchies ici

Cette phase franchit les gates de livraison — tests RED/GREEN intègres, build vert,
score de mutation au seuil (voir le [catalogue des gates]({{ "/fr/reference/gates" | relative_url }})).
Le reviewer indépendant émet son verdict avant que la livraison soit déclarée approuvée.
Une **draft PR** peut déjà contenir le rapport prévisionnel après création et push
autorisés séparément ; son ouverture ne signifie pas que les gates de livraison sont franchies.
