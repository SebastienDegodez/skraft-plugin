---
layout: doc
lang: fr
title: "skraft-config"
description: "Initialise et configure le fichier de paramètres SKRAFT du dépôt (skraft-config.json) — principalement le dial de rigueur depthTier qui gouverne l'ensemble du pipeline."
persona: tech-lead
---

# skraft-config

> Initialise et édite `skraft-config.json` — le fichier de paramètres **repository-wide** dont la clé centrale est `depthTier`, le dial de rigueur qui gouverne la variante TDD, les seuils de mutation, le nombre de lentilles de revue et la porte Gherkin dans chaque phase du pipeline.

## Quand l'utiliser

- Lors de l'initialisation d'un nouveau dépôt SKRAFT (`configure skraft`, `skraft-config init`)
- Pour modifier le niveau de rigueur du dépôt (`set depth tier`, `change strictness`)
- Une seule fois par dépôt — `depthTier` est une décision repository, pas un choix par tâche
- Jamais pour les paramètres par tâche — ceux-ci vivent dans `state.json` via le CLI d'état

## Contrat d'entrée

- Accès en lecture/écriture à la racine du dépôt
- Choix du `depthTier` confirmé avec l'utilisateur (ou `comprehensive` par défaut)
- `SKRAFT_CONFIG_ROOT` optionnel pour surcharger le répertoire de base

## Contrat de sortie

- `skraft-config.json` créé ou mis à jour à la racine du dépôt
- `depthTier` persisté parmi `{basic, standard, comprehensive, custom}`
- `depthTierRationale` persisté si le tier choisi descend en dessous de `comprehensive`
- Confirmation affichée à l'utilisateur, p.ex. `Repo depth tier set to 'standard' (was comprehensive).`

## Invariants

- **Déterminisme S7** — toute lecture et écriture d'une clé gouvernée passe par `config.mjs` ; ne jamais éditer `skraft-config.json` manuellement pour `depthTier` / `depthTierRationale`
- **`comprehensive` par défaut** — toute réduction exige une décision explicite avec rationale
- **Séquence A9 obligatoire** — init → choose → set → verify ; ne pas sauter l'étape de vérification
- **Clés inconnues rejetées** — `config.mjs set` retourne exit code 3 pour toute clé non gouvernée
- **`custom` non géré par `config.mjs set`** — `customDepth` est un champ structuré édité directement
- **Sauvegarde atomique** — le CLI préserve les champs non gouvernés et sauvegarde avant d'écrire

## Pourquoi cette forme

Un fichier de configuration repository-wide évite la dérive silencieuse du niveau de qualité entre les runs. Passer le `depthTier` par contexte de dispatch (plutôt que laisser chaque agent lire le fichier) garantit la cohérence et l'auditabilité.

> « The goal of software architecture is to minimize the human resources required to build and maintain the required system. »
> — Martin, R. C., *Clean Architecture*, 2017.

La séparation entre paramètres repository (`skraft-config.json`) et paramètres par tâche (`state.json`) suit le principe de responsabilité unique : chaque fichier a exactement un propriétaire et un périmètre.

## Customisation autorisée

- Choix du `depthTier` (`basic`, `standard`, `custom`) avec rationale (L1)
- `customDepth` par porte lorsque `depthTier: custom` — édité directement dans `skraft-config.json` (L2)
- `SKRAFT_CONFIG_ROOT` pour pointer vers un répertoire de base différent (L1)

## Voir aussi

- [skraft-difficulty-routing]({{ "/fr/reference/skills/skraft-difficulty-routing" | relative_url }}) — Routage 3 axes à la sortie de DISCOVER ; table des tiers de profondeur
- [craft-discipline]({{ "/fr/reference/skills/craft-discipline" | relative_url }}) — Discipline d'artisanat logiciel qui s'appuie sur les invariants du pipeline
