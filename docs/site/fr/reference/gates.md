---
layout: doc
lang: fr
title: "Gates de revue"
description: "Les gates (Gxx) franchies par phase : ce que chaque gate vérifie et pourquoi."
---

# Gates de revue

> Une *gate* est un critère explicite et binaire : le reviewer la déclare PASS ou
> FAIL avant que le pipeline passe à la phase suivante. Rien d'implicite, rien de
> « à l'œil ».

## Pourquoi — le problème que ça résout

Sans critères écrits, une revue dépend de l'humeur et de la mémoire du relecteur.
Les gates rendent la revue **reproductible** : chaque verdict s'appuie sur une liste
de contrôles connue d'avance, partagée par le producteur et le reviewer. Une gate qui
échoue bloque la transition (BLOCKER) ou signale un risque (HIGH/MEDIUM) — jamais un
ressenti vague.

## Comment lire ce catalogue

Chaque phase possède sa propre grille de gates, vérifiée par un **reviewer
indépendant** organisé en *lentilles* (chaque lentille regroupe les gates qui
défendent une même qualité). Pour chaque gate : son identifiant `Gxx`, ce qu'elle
vérifie, sa **condition de passage** (binaire) et sa **sévérité**.

| Sévérité | Signification | Effet sur le verdict |
| --- | --- | --- |
| **BLOCKER** | Violation fondamentale qui invalide l'artefact. | Force `rejected` — la phase ne passe pas. |
| **HIGH** | Défaut significatif, source de rework en aval. | Force `changes_requested`. |
| **MEDIUM** | Design smell, choix sous-optimal. | Force `changes_requested`. |
| **LOW** | Détail de style ou de cohérence. | `approved` avec note. |

Total : **46 gates** réparties sur les 5 phases. Tout ce qui suit est la grille
intégrale, telle que chaque reviewer l'applique.

---

## DISCOVER — G1 à G6

Reviewer : `backlog-discoverer-reviewer`. 3 lentilles. Vérifie le rapport de triage
et la proposition de sprint.

### Lentille 1 — Complétude

| ID | Ce que la gate vérifie | Condition de passage | Sévérité |
| --- | --- | --- | --- |
| **G1** | Les 3 modes de découverte (assignés, pilotés par artefact, par recherche) ont été considérés — ou le rapport documente explicitement pourquoi un mode est sauté. | Tous les modes pris en compte dans le rapport. | HIGH |
| **G2** | Aucune issue P0 ou P1 ouverte n'existe dans le dépôt sans figurer au rapport de triage. Vérification par échantillon sur les 5 plus récentes. | Zéro issue critique absente du triage. | BLOCKER |

### Lentille 2 — Priorisation

| ID | Ce que la gate vérifie | Condition de passage | Sévérité |
| --- | --- | --- | --- |
| **G3** | Toute P0 a une justification écrite ; P1→P3 suit l'ordre de valeur métier décroissante ; aucune inversion de priorité. | Aucune inversion, toutes les P0 justifiées. | HIGH |
| **G4** | La proposition de sprint respecte la capacité déclarée (jours-équipe × 0,7) ; aucune P2/P3 ne prend une place pendant qu'une P0/P1 est exclue ; aucune issue XL dans le sprint. | Capacité respectée, XL exclues. | HIGH |

### Lentille 3 — Détection de doublons

| ID | Ce que la gate vérifie | Condition de passage | Sévérité |
| --- | --- | --- | --- |
| **G5** | Deux issues ne décrivent pas le même problème (similarité de titre normalisée > 80 %). | Zéro paire de doublons non détectée. | HIGH |
| **G6** | Les paires à similarité 40–80 % sont signalées avec une recommandation (fusionner, lier, garder séparées). | Toutes les paires proches signalées. | MEDIUM |

---

## DISCUSS — G1 à G8

Reviewer : `backlog-planner-reviewer`. 4 lentilles. Vérifie les stories, les
critères d'acceptation et le plan de sprint.

### Lentille 1 — INVEST

| ID | Ce que la gate vérifie | Condition de passage | Sévérité |
| --- | --- | --- | --- |
| **G1** | Chaque story satisfait les 6 critères INVEST (Independent, Negotiable, Valuable, Estimable, Small, Testable). | Tous les critères passent pour chaque story. | HIGH |
| **G2** | Toutes les stories sont livrables indépendamment ; aucune dépendance circulaire. | Le graphe de dépendances est un DAG valide. | HIGH |

### Lentille 2 — Qualité des critères d'acceptation

| ID | Ce que la gate vérifie | Condition de passage | Sévérité |
| --- | --- | --- | --- |
| **G3** | Chaque story a ≥ 3 critères d'acceptation au format Given/When/Then ou liste ; aucun n'est une étape d'implémentation. | 3+ critères par story, bon format, sans prescription technique. | HIGH |
| **G4** | Aucun critère n'a deux interprétations valides pour un expert métier sans connaissance du code (pas de code HTTP, de verbe HTTP, de nom de classe). | Chaque critère résout à un résultat unique. | BLOCKER |

### Lentille 3 — Cohérence de planification

| ID | Ce que la gate vérifie | Condition de passage | Sévérité |
| --- | --- | --- | --- |
| **G5** | Les stories cadrent avec le thème du milestone ; aucune ne chevauche plusieurs thèmes sans décomposition. | Chaque story aligne avec le thème et la fenêtre du milestone. | HIGH |
| **G6** | Pas de dépendance circulaire ; la séquence de livraison respecte l'ordre topologique. | Le graphe est un DAG, le séquencement est dérivable. | BLOCKER |

### Lentille 4 — Conformité au Definition of Ready

| ID | Ce que la gate vérifie | Condition de passage | Sévérité |
| --- | --- | --- | --- |
| **G7** | Chaque story passe les 8 items du DoR : énoncé du problème, persona précis, ≥ 3 exemples métier, scénarios UAT, critères dérivés des UAT, bon calibrage, notes techniques, dépendances. | 8/8 items pour chaque story. | BLOCKER |
| **G8** | Zéro anti-pattern CRITIQUE (Implement-X, Giant Stories, No Examples) ni HAUT (critère technique, données génériques, tests après le code, persona vague, dépendances manquantes). | Aucun anti-pattern critique détecté. | BLOCKER / HIGH |

---

## DESIGN — G1 à G15

Reviewer : `solution-architect-reviewer`. 3 lentilles + 1 gate transverse
d'escalade. Vérifie les ADR, le registre de supersession, les diagrammes, les
contrats, les matrices de cohérence.

### Lentille 1 — Cohérence

| ID | Ce que la gate vérifie | Condition de passage | Sévérité |
| --- | --- | --- | --- |
| **G1** | Tout engagement structurel — visible dans un diagramme ou détecté dans le code (bus de commande/requête, event store, saga, ACL inter-contexte) — est justifié par un ADR `Accepted` traçable. | Chaque élément structurel référence ≥ 1 ADR accepté. | BLOCKER |
| **G2** | Deux ADR ne se contredisent pas ; toute supersession est enregistrée dans le corps du nouvel ADR ET dans le registre append-only `supersessions.md`. | Zéro décision contradictoire, liens de supersession complets. | BLOCKER |
| **G10** | Une matrice de cohérence existe par story et sa ligne `consistency-gate` est `PASS` ; le journal de back-propagation explique chaque réécriture. | Une matrice par story, toutes PASS. | BLOCKER |
| **G12** | Chaque ligne d'un plan de supersession est réalisée (corps de l'ADR, ligne de registre, plus aucune référence à l'ADR remplacé comme source de vérité). | Les trois conditions tiennent pour chaque supersession. | BLOCKER |
| **G14** | Aucun ADR n'encode le verdict dans le **nom de fichier** ; le verdict vit dans le frontmatter `Status:`. Un `Status: Rejected` n'est admissible que s'il trace à une story et nomme l'alternative adoptée. | Zéro nom de fichier porteur de verdict, chaque rejet tracé. | BLOCKER |

### Lentille 2 — Conformité architecturale

| ID | Ce que la gate vérifie | Condition de passage | Sévérité |
| --- | --- | --- | --- |
| **G3** | Règle de dépendance : les couches Domain et Application ne dépendent ni d'Infrastructure ni d'API. | Zéro import d'Infrastructure/API dans Domain ou Application. | BLOCKER |
| **G4** | Toutes les interfaces applicatives (repositories, gateways, publishers) sont définies dans la couche Application, jamais dans Infrastructure. | Zéro interface définie par l'Infrastructure. | BLOCKER |
| **G5** | Chaque agrégat fait respecter ses propres invariants, pas ceux d'un autre agrégat. | Zéro invariant inter-agrégat. | HIGH |
| **G6** | Le context map déclare chaque relation inter-contexte avec un pattern explicite (ACL, Conformist, Shared Kernel, Partnership, OHS, Published Language) et chaque étiquette est admissible. | Zéro flèche non étiquetée, zéro étiquette inadmissible. | HIGH |

### Lentille 3 — Adéquation (fitness)

| ID | Ce que la gate vérifie | Condition de passage | Sévérité |
| --- | --- | --- | --- |
| **G7** | Chaque story de DISCUSS mappe à ≥ 1 déclencheur (Command ou Query) du modèle d'événements. | Tous les IDs de story apparaissent dans une tranche. | HIGH |
| **G8** | Chaque **Command** a au moins un événement de domaine correspondant ; les Queries en sont exemptées. | Zéro commande sans événement. | HIGH |
| **G9** | Aucun agrégat, contexte, adoption d'Event Sourcing ou Saga n'est introduit sans justification par une story. | Zéro élément architectural injustifié. | MEDIUM |
| **G11** | Tout ADR adoptant un pattern complexifiant (CQRS, Event Sourcing, Saga, cohérence éventuelle, split micro-service, ACL) cite une force admissible ET évalue l'option « faire sans ». | Force admissible + alternative « faire sans » pour chaque ADR complexifiant. | HIGH |
| **G15** | Aucun ADR ne ratifie une contrainte qui est le **socle imposé** du projet (CQS au niveau méthode, frontières Clean Architecture, DI par convention, repository). Les déviations et ajouts restent valides. | Zéro ADR `Accepted` qui répète un socle imposé. | HIGH |

### Transverse — Escalade

| ID | Ce que la gate vérifie | Condition de passage | Sévérité |
| --- | --- | --- | --- |
| **G13** | Chaque blocker `decision-drift-*` a un fichier `-resolution.md` frère contenant la réponse humaine. Un blocker ouvert signifie qu'un humain doit trancher. | Un fichier de résolution pour chaque blocker. | BLOCKER (court-circuit) |

> Si G13 échoue, le reviewer renvoie `REJECTED` immédiatement **sans** évaluer les
> autres gates : la prochaine action est l'escalade humaine, pas un nouvel essai.

---

## DISTILL — G1 à G8

Reviewer : `acceptance-designer-reviewer`. 4 lentilles. Vérifie les scénarios
Gherkin, le plan de test et le plan d'implémentation.

### Lentille 1 — Couverture

| ID | Ce que la gate vérifie | Condition de passage | Sévérité |
| --- | --- | --- | --- |
| **G1** | Bijection critère↔scénario : chaque critère d'acceptation mappe à ≥ 1 scénario, aucun scénario n'est orphelin. | Tous les critères couverts, aucun scénario orphelin. | BLOCKER |
| **G2** | Les conditions limites et cas négatifs des exemples métier sont représentés en scénarios. | ≥ 1 cas limite par règle métier. | HIGH |

### Lentille 2 — Alignement métier

| ID | Ce que la gate vérifie | Condition de passage | Sévérité |
| --- | --- | --- | --- |
| **G3** | Tout le vocabulaire des étapes Given/When/Then appartient au lexique métier — aucun nom de classe, de méthode, de verbe HTTP ou de framework. | Zéro identifiant technique dans les `.feature`. | HIGH |
| **G4** | Les étapes ne contiennent aucun détail d'implémentation (code HTTP, terme ORM, langage SQL, conteneur DI). | Zéro fuite d'implémentation. | BLOCKER |

### Lentille 3 — Testabilité

| ID | Ce que la gate vérifie | Condition de passage | Sévérité |
| --- | --- | --- | --- |
| **G5** | Chaque étape est implémentable sans demander de clarification : un seul sens dans le vocabulaire métier. | Chaque étape mappe à une action/un état unique. | HIGH |
| **G6** | Chaque scénario des `.feature` a une entrée correspondante dans le plan d'implémentation (chemin de fichier + frontière de cas d'usage). | Bijection scénarios ↔ entrées du plan. | HIGH |

### Lentille 4 — Respect des frontières

| ID | Ce que la gate vérifie | Condition de passage | Sévérité |
| --- | --- | --- | --- |
| **G7** | Chaque ligne de la matrice de couverture vise un cas d'usage de la couche Application nommé dans les contrats — jamais un adaptateur d'Infrastructure comme point d'entrée. | Chaque entrée référence une frontière de cas d'usage. | BLOCKER |
| **G8** | Au moins un scénario walking skeleton par flux majeur est identifié (tag `@smoke` ou marqué dans la matrice). | ≥ 1 walking skeleton par flux. | HIGH |

---

## DELIVER — G1 à G9

Producteur : `software-engineer` ; vérificateur : `quality-gates-lens`. Chaque gate
est attestée par une **évidence falsifiable** (SHA git, sortie d'outil déposée sur
disque) que le reviewer re-résout sans jamais rejouer le build.

| ID | Ce que la gate atteste | Condition de passage | Sévérité |
| --- | --- | --- | --- |
| **G1** | Les tests d'acceptation passent. | Le scénario BDD de la story active est vert. | BLOCKER |
| **G2** | Tous les tests unitaires passent. | La suite unitaire complète est verte. | BLOCKER |
| **G3** | Le build passe. | Compilation / vérification de types réussie. | BLOCKER |
| **G4** | L'analyse statique passe. | Linter/analyseur sans problème bloquant. | HIGH |
| **G5** | Les règles d'architecture passent. | Les tests de direction de dépendance (Clean Architecture) passent. | BLOCKER |
| **G6** | Le score de mutation atteint le seuil. | Score du runner de mutation ≥ seuil du *depthTier* sur la logique métier. | HIGH |
| **G7** | Aucun mock dans le cœur Domain/Application. | Attestation par grep : zéro symbole de framework de mock dans ces couches. | HIGH |
| **G8** | Format de commit conventionnel. | Chaque commit couvert suit `<type>(<scope>): <sujet>`. | MEDIUM |
| **G9** | Aucune altération de test (intégrité RED→GREEN). | Pour chaque cycle, le fichier de test n'a changé que par **ajout** entre les snapshots RED et GREEN. | BLOCKER |

> Une gate réellement non pertinente est marquée `not_applicable` **avec
> justification** — jamais en remplacement d'un `fail` ou d'une évidence manquante.

---

## Logique de verdict

Le reviewer agrège les gates selon une règle déterministe — pas de pondération
floue :

| Constat | Verdict |
| --- | --- |
| ≥ 1 gate **BLOCKER** échouée (ou G13 ouverte en DESIGN) | `rejected` |
| ≥ 1 gate **HIGH**, aucune BLOCKER | `changes_requested` |
| Gates **MEDIUM** seules | `changes_requested` |
| Gates **LOW** seules, ou tout passe | `approved` |

## Pourquoi cette pratique

> « A software inspection is a rigorous review with explicit entry and exit criteria. »
> — Wiegers, K., *Peer Reviews in Software*, 2002.

Des critères d'entrée/sortie explicites, c'est exactement ce qu'une gate matérialise :
la phase n'est « finie » que lorsque ses gates sont franchies.

## Pièges & anti-patterns

- **Gate cosmétique** : un critère trop vague (« le code est propre ») n'est pas une
  gate — il faut un test binaire vérifiable.
- **Reviewer complaisant** : si le producteur et le reviewer sont la même personne,
  la gate perd son pouvoir. SKRAFT impose un reviewer *indépendant*.
- **Court-circuit** : certaines gates (ex. DESIGN G13) court-circuitent toute la revue
  si un blocker humain reste non résolu — ne pas les contourner.

## Pour aller plus loin

- [Les lentilles de revue adverse](lens.html)
- [La revue avant la revue]({{ "/fr/explanation/pourquoi-review-avant-review" | relative_url }})
- [Le deep-dive review-before-review]({{ "/fr/explanation/deep-dive/review-before-review" | relative_url }})

## Sources

- Wiegers, K. *Peer Reviews in Software*, 2002.

Termes à connaître : **gate**, **reviewer**, **BLOCKER**, **INVEST**, **walking
skeleton** — voir le [glossaire]({{ "/fr/reference/glossaire" | relative_url }}).
