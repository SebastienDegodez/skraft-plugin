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
| **Vient de** | **DISTILL** — les scénarios Gherkin, le plan de tests, le plan d'implémentation et le test d'acceptation RED |
| **Ce qui entre** | Spécifications exécutables à implémenter, dans l'ordre du plan d'implémentation, avec la couche et le double du plan de tests pour chaque scénario ; contrats, index ADR, conventions de recherche et commandes de stack |
| **Ce qui sort** | Code testé + évidence qualité (tests, build, lint, RED→GREEN, captures d'écran pour une story frontend) ; rapport de résultat à la fin ou au blocage |
| **Va vers** | La **Pull Request** — revue humaine puis livraison |
| **Agent responsable** | `software-engineer` |
| **Reviewer associé** | `software-engineer-reviewer` |

## Pourquoi cette phase existe

Le code est le seul artefact qui compte en production. Le software-engineer applique l'Outside-In TDD : les Acceptance Test guident les tests unitaires, qui guident l'implémentation. Le score de mutation, lancé par la CI du projet, vérifie que les tests protègent réellement le comportement. Le reviewer est read-only — il ne modifie jamais le code.

> « We grow working software, guided by tests, from the outside in. »
> — Freeman, S. & Pryce, N., *Growing Object-Oriented Software, Guided by Tests*, 2009.

<div class="fil-rouge" markdown="1">
<span class="fil-rouge__label">☕ Fil rouge — Starbucks <em>(exemple illustratif)</em></span>

Le scénario entre. DELIVER implémente le calcul du total et l'attribution des points en cycles **RED → GREEN** ; le journal d'évidence atteste chaque gate verte. Le code part en Pull Request, où la CI du projet calcule le **score de mutation** qui atteste que les tests protègent réellement la règle de fidélité.
</div>

## Ce que produit l'agent

- Code implémenté selon le cycle RED → GREEN → REFACTOR.
- Tests d'acceptation passants liés aux scénarios Gherkin.
- Tests unitaires couvrant les invariants du Domain.
- Captures d'écran du résultat frontend, pour une story frontend.
- Journal d'évidence des quality gates (schéma v7, dans le répertoire d'évidence ignoré par Git), journal de changements et données de résultat pour le reviewer.

## Handoff, RED et rework

DELIVER démarre depuis le bloc `state.mjs handoff`, pas depuis une reconstruction fraîche.
Le bloc porte le `.feature`, `test-plan-{story}.md`, `impl-plan-{story}.md`,
`contracts-{story}.md`, `docs/adr/decisions-index.md`, les conventions de recherche,
`stack-commands.md` et le test d'acceptation RED. Les retries portent le même bloc, donc
le plan de tests et le plan d'implémentation restent présents pendant le rework.

Le RED est le commit `test` de DISTILL, qui porte le test d'acceptation de chaque scénario.
L'engineer les rend verts groupe par groupe — les scénarios qui fixent une règle et ses cas
limites —, un commit vert par groupe, la gate excluant les scénarios encore dus, le dernier
groupe lançant toute la suite. Un seul dispatch livre tous les scénarios. Le
pipeline ne lance ni mutation ni couverture : les deux sont des étapes de la CI du projet.
Le journal d'évidence est écrit une seule fois, après le dernier commit de travail, par les
scripts de l'adaptateur de la stack, dans
`.copilot-tracking/skraft-plans/{projectSlug}/evidence/{date}/{story}/`, que Git ignore : il
contient les verdicts des gates et, pour une story frontend, les captures d'écran — rien
d'autre. Rien n'est commité, aucun snapshot n'est pris : `qg-verify` lit les commits et les
tests RED dans Git.

Le reviewer prépare `diff-{story}.patch` et `files-{story}.txt` une seule fois, puis donne
ces chemins aux lentilles. `quality-gates` reçoit aussi le plan de tests, `test-integrity`
reçoit le plan de tests et le `.feature`, `architecture-boundaries` reçoit les contrats et
l'index ADR, et `cold-reader` ne reçoit que le patch et la liste de fichiers.

En rework, l'engineer ne change que ce que les findings de la revue précédente nomment. En
re-review, le reviewer relance les lentilles ou gates qui ont échoué, étaient
`inconclusive` ou dont les entrées ont changé, et reporte les autres résultats passants
dans le YAML de verdict. Si le seul problème est une gate `inconclusive` causée par
l'environnement, l'orchestrateur escalade la cause et la commande à l'utilisateur au lieu
d'envoyer l'engineer en rework. Une fois l'environnement réparé par l'utilisateur,
l'engineer relance uniquement ces gates `inconclusive`, sans modifier le code ni consommer
de retry, puis le reviewer refait sa revue.

## Des preuves au rapport de résultat

**L'intégration du reporting est en cours.** Le flux approuvé rapporte, à la fin ou au
blocage, le plan de tests, les tests exécutés et, pour un front, les captures d'écran.
Le [software engineer]({{ "/fr/dashboard/#agent-software-engineer" | relative_url }})
possède les preuves, le journal des changements et les références d'impact.
L'[engineer reviewer]({{ "/fr/dashboard/#agent-software-engineer-reviewer" | relative_url }})
et ses lentilles existantes valident ces artefacts et possèdent le verdict canonique.
L'orchestrateur coordonne le rendu et la publication, pas la capture des preuves ni
la synthèse de revue. Aucun agent de reporting ni panel supplémentaire n'est ajouté.

Dans l'extraction approuvée, [qa-reporting]({{ "/fr/dashboard/#skill-qa-reporting" | relative_url }})
possède les consignes de préparation, le contrat canonique des données de rapport et
les modèles Markdown prévisionnel/résultat livrés avec le skill. Les scripts rendent
le modèle de résultat à partir des preuves consignées et des références de revue ;
le skill ne remplace pas les règles de preuve et ne possède pas le transport.
Données de rapport, Markdown et reçus générés restent dans les répertoires de suivi
résolus du projet consommateur, jamais dans le skill installé. Aucune surcharge
entreprise, aucun profil ni nouvelle clé de configuration n'est introduit.
L'intégration des modèles et la parité du rendu par défaut restent à valider.

Le résultat projette les tests, build, contrôles statiques, captures d'écran,
revue, commits/fichiers et limites consignés dans du Markdown. Une preuve absente ou
périmée reste non vérifiée ; les mesures ne sont pas inventées. Un résultat bloqué
précise le travail incomplet. Les contrôles locaux des preuves et le verdict de revue
persisté restent distincts : le rendu actuel laisse la vérification des objets Git
`commit.convention`/`test.integrity` au reviewer. Livré ne signifie pas déployé.

Pour le frontend, les producteurs existants capturent les preuves Playwright et les
reviewers les vérifient : une story frontend enregistre `evidence.screenshots`, et
`qg-verify` la fait échouer sans capture d'écran (`SCREENSHOTS_MISSING`). Seules les preuves déjà accessibles à distance reçoivent un
lien, avec leurs limites d'accès ; les preuves locales sont explicitement indisponibles
à distance, jamais présentées comme des pièces jointes publiées. Le plafond de médias choisi
au démarrage peut être nul et n'a pas de valeur par défaut imposée. Il limite les liens
du rapport, pas les preuves locales conservées pour la revue. Les omissions restent
visibles. Aucun téléversement, hébergement ou rejeu navigateur automatique n'est ajouté
pour simplement mettre en forme le rapport.

Le résultat est le commentaire PR stable de la story. Les choix de démarrage gouvernent PR complète,
issue en mode lien, rapport complet ou aucun rapport, et résumé chat. Les destinations complètes réutilisent
le même corps rendu ; les liens d'issue sont préparés seulement après réception de
l'URL retournée du commentaire dans le reçu PR/MR correspondant.

Les scripts rendent et valident localement ; l'orchestrateur assure la publication
distante via l'hôte. Pour GitHub, le skill livré
[github-publication]({{ "/fr/dashboard/#skill-github-publication" | relative_url }})
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
sans nouveau cycle d'ingénierie ni de capture. Contenu du résultat et responsabilité
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

Cette phase franchit les gates de livraison — tests RED/GREEN intègres, build et lint
verts, aucun mock dans le cœur, convention de commit et, pour une story frontend, captures
d'écran ; mutation et couverture tournent dans la CI du projet (voir le [catalogue des gates]({{ "/fr/reference/gates" | relative_url }})).
Le reviewer indépendant émet son verdict avant que la livraison soit déclarée approuvée.
Une **draft PR** peut déjà exister après création et push
autorisés séparément ; son ouverture ne signifie pas que les gates de livraison sont franchies.
