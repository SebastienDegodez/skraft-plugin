---
layout: doc
lang: fr
title: "DISTILL"
persona: software-engineer
---

# DISTILL

{% include phase-ribbon.html current="distill" %}

La phase DISTILL transforme les décisions d'architecture en spécifications exécutables.

## Ce qui entre, ce qui sort

| | |
|---|---|
| **Vient de** | **DESIGN** — l'ADR et le modèle d'événements |
| **Ce qui entre** | Décisions d'architecture à spécifier |
| **Ce qui sort** | Scénarios Gherkin + plan de tests + plan d'implémentation ; le flux de reporting approuvé ajoute un rapport prévisionnel |
| **Va vers** | **DELIVER** — qui les implémente en TDD |
| **Agent responsable** | `acceptance-designer` |
| **Reviewer associé** | `acceptance-designer-reviewer` |

## Pourquoi cette phase existe

Les scénarios Gherkin servent de contrat entre le métier et le code. L'acceptance-designer écrit des scénarios Given-When-Then qui capturent le comportement attendu. Le reviewer vérifie que chaque critère d'acceptation est couvert et que les scénarios sont testables.

> « Specification by Example bridges the communication gap between business and technology. »
> — Adzic, G., *Specification by Example*, 2011.

<div class="fil-rouge" markdown="1">
<span class="fil-rouge__label">☕ Fil rouge — Starbucks <em>(exemple illustratif)</em></span>

L'ADR et le modèle d'événements entrent. DISTILL écrit le **scénario Gherkin** : « Étant donné un panier avec un latte / Quand le paiement est validé / Alors un reçu est émis et des points fidélité sont crédités. » Ce scénario devient le contrat que DELIVER doit rendre vert.
</div>

## Ce que produit l'agent

- Fichiers `.feature` au format Gherkin avec Given-When-Then.
- Matrice de couverture liant chaque critère d'acceptation à un scénario.
- Plan d'implémentation ordonnant les tests par couche (Domain, Application, Infrastructure, API).
- Identification des Test Double nécessaires par frontière.

## Du plan approuvé au rapport prévisionnel

**L'intégration du reporting est en cours.** Dans le flux approuvé,
l'[acceptance designer]({{ "/fr/dashboard/#agent-acceptance-designer" | relative_url }})
possède le plan de tests, la traçabilité critère-scénario/test et l'impact attendu.
L'[acceptance reviewer]({{ "/fr/dashboard/#agent-acceptance-designer-reviewer" | relative_url }})
vérifie ces entrées dans la revue existante. Après approbation de DISTILL, le rendu
déterministe les projette dans un rapport prévisionnel Markdown avant DELIVER si une
PR est disponible. Il décrit des contrôles **prévus**, jamais un résultat exécuté ni
une mesure inventée.

La chaîne d'artefacts reste explicite : **décisions DESIGN → scénarios et plan de tests
revus → rapport prévisionnel → preuves DELIVER → rapport de résultat**. L'orchestrateur
coordonne la publication ; aucun agent de reporting ni panel de revue supplémentaire
n'est introduit.

Dans l'extraction approuvée, [qa-reporting]({{ "/fr/dashboard/#skill-qa-reporting" | relative_url }})
possède les consignes de préparation, le contrat canonique des données de rapport et
les modèles Markdown prévisionnel/résultat livrés avec le skill. Les scripts rendent
le modèle prévisionnel à partir du plan revu ; le skill n'exécute pas les tests, ne
décide pas des gates et ne possède pas le transport. Données de rapport, Markdown et
reçus générés restent dans les répertoires de suivi résolus du projet consommateur,
jamais dans le skill installé. Aucune surcharge entreprise, aucun profil ni nouvelle
clé de configuration n'est introduit. L'intégration des modèles et la parité du rendu
par défaut restent à valider.

Au démarrage, les choix portent sur les rapports complets dans la PR, l'issue en mode
lien, rapport complet ou aucun rapport, le résumé chat et un plafond de médias explicite,
sans valeur par défaut imposée. PR complète + lien dans l'issue + résumé chat est une
recommandation, pas un automatisme. Les cibles et choix confirmés persistent pour la reprise.
Sans PR/MR sélectionnée, le rapport prévisionnel reste en attente : créer un brouillon
exige l'accord de l'utilisateur et une opération exposée par l'hôte ; pousser exige
un consentement séparé. Les scripts locaux ne créent aucune PR et ne poussent rien.

Le rapport prévisionnel est le premier de deux commentaires PR stables ; le second
consigne la fin ou le blocage. Les scripts rendent et valident localement ; l'orchestrateur
assure la publication distante via l'hôte. Pour GitHub, le skill livré
[github-search-protocol]({{ "/fr/dashboard/#skill-github-search-protocol" | relative_url }})
possède la procédure : MCP en priorité, repli annoncé vers `gh` dans l'hôte seulement si
MCP ou une capacité requise est indisponible selon la politique du skill. Aucun skill
compagnon externe n'est requis. Azure DevOps/GitLab restent des cibles de reporting MCP
uniquement, sans prise en charge du pipeline complet.

Le reçu compare localement la relecture de l'hôte, sans vérification réseau indépendante
par les scripts. Un lien d'issue exige l'URL retournée du reçu PR/MR correspondant ; sans
elle, le lien reste en attente et aucun permalien n'est inventé. Ce sont des commentaires
Markdown, pas des rapports téléversés ou hébergés. La reprise de publication réutilise le
rapport enregistré, sans nouveau cycle d'ingénierie. Abandonner une tentative locale non
résolue exige une confirmation humaine explicite et un motif ; les reçus sont conservés
et aucune écriture distante n'est annulée.

Les correspondances fournisseur sont testées uniquement par des fixtures locales ;
disponibilité réelle et intégration de bout en bout via l'hôte restent non vérifiées.
Un rendu unique évite une nouvelle synthèse, pas le travail de transmission ou de relecture.
Liens d'issue et résumés chat évitent de répéter les rapports complets ; aucune économie
de jetons mesurée ni aucun prix n'est annoncé.

Sources de ce protocole en cours d'intégration :
[contrat d'acceptation CLI MCP](https://github.com/SebastienDegodez/skraft-plugin/blob/main/tests/skraft-framework/reporting/report-mcp-cli.acceptance.test.mjs),
[contrat de passage MCP](https://github.com/SebastienDegodez/skraft-plugin/blob/main/tests/skraft-framework/reporting/report-mcp-handoff.acceptance.test.mjs),
[politique de préférences](https://github.com/SebastienDegodez/skraft-plugin/blob/main/plugins/skraft-framework/src/domain/reporting-preferences.mjs)
et [rendu prévisionnel](https://github.com/SebastienDegodez/skraft-plugin/blob/main/plugins/skraft-framework/src/application/render-report.mjs).
La publication ne remplace pas la revue des spécifications décrite plus haut.

## Les gates franchies ici

Cette phase franchit les gates **G1–G8** (voir le [catalogue des gates]({{ "/fr/reference/gates" | relative_url }})).
Chaque gate est vérifiée par le reviewer indépendant avant le passage à **DELIVER**.
