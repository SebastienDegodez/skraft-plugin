---
layout: doc
lang: fr
title: "Démarrage rapide"
description: "Installer SKRAFT avec /plugin, choisir le bon parcours et lancer le premier workflow."
persona: software-engineer
---

# Démarrage rapide

> Installez le plugin dans votre assistant, choisissez votre point de départ, puis lancez le workflow adapté à votre projet.

## Avant de commencer

- **Claude Code**, pour utiliser les commandes `/plugin` ci-dessous
- un dépôt cible ouvert dans votre assistant
- un accès GitHub uniquement si vous voulez travailler depuis des issues

Node.js, APM et un clone du dépôt SKRAFT ne sont pas requis pour utiliser le
plugin. Ils concernent le développement du plugin lui-même.

## 1. Installer SKRAFT avec `/plugin`

Saisissez ces commandes dans la conversation Claude Code, pas dans un terminal :

```text
/plugin marketplace add SebastienDegodez/skraft-plugin
/plugin install skraft
```

La première commande ajoute le dépôt comme marketplace. La seconde installe le
plugin `skraft` publié par ce marketplace. Ouvrez ensuite `/plugin` et vérifiez que
`skraft` apparaît dans les plugins installés.

## 2. Choisir votre parcours

Ne lancez pas automatiquement toute la chaîne. Le bon point de départ dépend de
ce que votre dépôt possède déjà.

| Votre situation | Commencez par | Puis |
| --- | --- | --- |
| Une story est déjà affinée | `skraft-orchestrator` | pipeline d'ingénierie |
| Des issues existent, mais ne sont pas préparées | `backlog-discoverer`, puis `backlog-planner` | `skraft-orchestrator` |
| Le code existe sans documentation produit | `brownfield-analyst` | PRD, création des issues, préparation produit, puis `skraft-orchestrator` |
| Le legacy est dangereux à modifier | `brownfield-harness-builder`, puis `brownfield-refactorer` | retour vers une story préparée, puis `skraft-orchestrator` |

Les workflows Brownfield, DISCOVER et DISCUSS sont invoqués directement. Ils ne
sont pas des phases cachées de `skraft-orchestrator`. Consultez le
[parcours Brownfield]({{ "/fr/explanation/brownfield" | relative_url }}) si vous
reprenez un système existant.

## 3. Lancer le premier workflow

### Story déjà prête

Dans le sélecteur d'agents, choisissez `skraft-orchestrator`, puis donnez-lui la
story affinée. C'est le seul point d'entrée du pipeline d'ingénierie. Il charge
son état persistant et reprend au dernier point validé.

### Backlog encore brut

Choisissez d'abord `backlog-discoverer` dans le sélecteur d'agents. Une fois le
triage terminé, choisissez `backlog-planner` pour affiner l'issue retenue. La
story affinée devient alors l'entrée de `skraft-orchestrator`.

## 4. Comprendre ce qui va s'exécuter

Le parcours principal contient deux zones distinctes :

1. **Préparation produit optionnelle et autonome**
	- **DISCOVER** trie et priorise les issues
	- **DISCUSS** transforme une issue en story vérifiable
2. **Pipeline d'ingénierie piloté par `skraft-orchestrator`**
	- **RESEARCH** réduit l'incertitude lorsque le travail le justifie
	- **DESIGN** prend et trace les décisions d'architecture
	- **DISTILL** produit les scénarios exécutables et le plan
	- **DELIVER** implémente par Outside-In TDD et rassemble les preuves

RESEARCH peut être sauté lorsque le routage conclut qu'une investigation dédiée
n'apporterait rien. DISCOVER et DISCUSS ne sont jamais dispatchés par
`skraft-orchestrator` : vous les choisissez avant lui lorsque votre entrée n'est
pas encore une story prête.

## 5. Continuer la lecture

- [Choisir un point d'entrée et voir le pipeline]({{ "/fr/explanation/pipeline/" | relative_url }})
- [Suivre une demande de bout en bout]({{ "/fr/explanation/pipeline/fil-rouge" | relative_url }})
- [Reprendre un système Brownfield]({{ "/fr/explanation/brownfield" | relative_url }})
