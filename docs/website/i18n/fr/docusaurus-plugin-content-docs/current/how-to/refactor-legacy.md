---
title: "Refactorer un code existant sous filet"
description: "Lancer brownfield-refactorer comme agent principal, choisir Mikado ou Strangler Fig, suivre le graphe ou le plan de tranches, et répondre aux signaux ADVANCE, EXPAND, DONE et BLOCKED, le filet vert à chaque commit."
persona: software-engineer
---

# Refactorer un code existant sous filet

**But** : modifier en place ou remplacer une partie d'un code existant, une feuille ou une tranche
à la fois, avec un commit vert à chaque pas.

Pour comprendre les deux méthodes : [Parcours Brownfield](../explanation/brownfield.md),
[Ellnestam & Brolund, 2014](../reference/citations.mdx#cite-ellnestam-brolund-mikado-2014) (Mikado),
[Fowler, 2004](../reference/citations.mdx#cite-fowler-strangler-2004) (Strangler Fig).

## Prérequis

- Les plugins `skraft` et `skraft-brownfield` installés.
- Un filet vert sur le code visé : le rapport de `brownfield-harness-builder` avec le verdict
  `PASS`, ou `CONCERNS` dont vous acceptez les trous
  ([Poser un filet de caractérisation](./characterize-legacy.md)).
- Les commandes `build` et `test` du composant dans `skraft-config.json`, sinon celles que nomme
  le rapport du harnais.
- Une branche de travail propre.

## 1. Ouvrir une session avec le refactoreur comme agent principal

Le refactoreur lance lui-même un `refactoring-worker` par feuille ou par tranche : il doit être
l'agent principal de la session, jamais un sous-agent.

| Hôte | Comment |
|---|---|
| Claude Code | `claude --agent skraft-brownfield:brownfield-refactorer` |
| Copilot CLI, VS Code | dans une nouvelle session, choisissez l'agent **Skraft - Brownfield Refactorer** avant le premier message |

## 2. Donner le but et le filet

Écrivez le but en une phrase de valeur, et dites où est le filet :

```text
But : les factures s'émettent sans que la facturation sache comment le client est notifié.
Filet : rapport du harness builder pour services/billing, verdict PASS.
```

Un but vague (« améliorer l'architecture ») est refusé : l'agent en demande un plus précis. Sans
filet accepté, il s'arrête et renvoie vers `brownfield-harness-builder`.

## 3. Choisir la stratégie

L'agent recommande une stratégie avec sa raison, puis attend votre réponse :

| Vous voulez… | Stratégie | Artefact sous `.copilot-tracking/skraft-plans/<slug>/refactoring/<date>/` |
|---|---|---|
| modifier en place (extraire, découpler, changer d'ORM) | Mikado | `mikado-<slug>.md` : un graphe Mermaid de prérequis |
| remplacer (réécrire, changer de stack ou de service) | Strangler Fig | `strangler-<slug>.md` : une ligne par tranche |

## 4. Suivre la boucle

L'agent relit l'artefact, confie l'élément suivant à un `refactoring-worker` neuf, puis agit sur
son signal :

| Signal | Ce qui s'est passé | Ce que vous faites |
|---|---|---|
| `ADVANCE` | feuille ou tranche faite et commitée, filet vert | rien : l'agent passe à la suivante |
| `EXPAND` | l'élément cache des prérequis, ou la tranche est trop grosse ; rien n'est commité | relire les éléments ajoutés à l'artefact |
| `BLOCKED` | l'élément a besoin d'une décision | répondre à la question ; rien n'est confié avant |
| `DONE` | but atteint (Mikado), ou ancien code retiré (Strangler) | lire le rapport final |

**Mikado.** Chaque feuille est commitée avec le graphe, sous le titre
`refactor(mikado-graph): <id> done`. Pour vérifier le graphe vous-même, lancez le validateur du
skill `mikado-method` (`<skill>` est son dossier dans le plugin installé) :

```console
$ sh "<skill>/scripts/validate-mikado.sh" .copilot-tracking/skraft-plans/<slug>/refactoring/<date>/mikado-<slug>.md
powershell -NoProfile -ExecutionPolicy Bypass -File "<skill>/scripts/validate-mikado.ps1" <graphe>
```

```text
--- Pass 8: True leaf enumeration ---
  [OK]    Leaf ready: {N3} [ ] {N3} Golden Master on BillingService.SendInvoice…
=== Summary ===
  Result       : VALID - graph is ready for the next leaf
```

Sortie 0 : le graphe est valide et liste les feuilles prêtes ; sortie 1 : il faut le corriger
avant toute feuille.

**Strangler Fig.** La tranche zéro pose la façade et prouve qu'elle est transparente. Une tranche
ne bascule que si ses tests de caractérisation passent sur le nouveau code avec les mêmes
assertions que sur l'ancien, et que tout le filet reste vert. Toute différence de comportement
revient vers vous en `BLOCKED` : décidez si elle est voulue.

## Dépannage

| Situation | Action |
|---|---|
| L'agent dit qu'il ne peut pas lancer `refactoring-worker` | Il tourne comme sous-agent : ouvrir une session avec lui comme agent principal (étape 1). |
| `[SKILL MISSING] mikado-method` | Réinstaller `skraft-brownfield`. |
| Le validateur sort 1 sur un commit de découverte | Retitrer le commit en `refactor(mikado-graph): …` : le validateur refuse un `discovered:` sur un commit titré autrement. |
| Une tranche reste en `CONCERNS` | Une différence entre ancien et nouveau attend votre décision ; la tranche reste sur l'ancien code d'ici là. |

## Voir aussi

- [Poser un filet de caractérisation](./characterize-legacy.md)
- [Parcours Brownfield](../explanation/brownfield.md) — pourquoi le graphe
  reste piloté par l'humain.
- [Le catalogue des agents et skills](pathname:///dashboard/#agent-brownfield-refactorer)
