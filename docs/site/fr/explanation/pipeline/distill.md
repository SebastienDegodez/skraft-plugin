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
| **Ce qui sort** | Scénarios Gherkin + plan de tests + plan d'implémentation + commandes de stack + tests d'acceptation RED |
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
- `details/{date}/stack-commands.md`, quand les commandes ont dû être résolues ou corrigées.
- Le test d'acceptation exécutable de chaque scénario, nommé d'après son scénario (`S4_…`), avec les stubs qui le font compiler, commités RED en un seul commit `test`.

## Comment DELIVER reçoit la preuve d'exécution

DISTILL résout les commandes de build, test et mutation une seule fois dans
`stack-commands.md` au lieu de laisser l'engineer les redécouvrir. Il écrit le test
d'acceptation de chaque scénario, les lance une fois et vérifie que chacun échoue sur une
assertion métier, puis les commite en un seul commit `test` : le RED de tous les scénarios.
Aucun run RED n'est capturé ; le software engineer n'écrit ni ne modifie jamais un test
d'acceptation.

## Reporting

DISTILL ne publie aucun rapport. La QA lit le plan de tests que
l'[acceptance designer]({{ "/fr/dashboard/#agent-acceptance-designer" | relative_url }})
écrit et que son reviewer approuve ; le seul rapport QA est le rapport de résultat de
DELIVER : les tests exécutés et, pour un front, les captures d'écran (voir
[DELIVER]({{ "/fr/explanation/pipeline/deliver" | relative_url }})).

## Les gates franchies ici

Cette phase franchit les gates **G1–G8** (voir le [catalogue des gates]({{ "/fr/reference/gates" | relative_url }})).
Chaque gate est vérifiée par le reviewer indépendant avant le passage à **DELIVER**.
