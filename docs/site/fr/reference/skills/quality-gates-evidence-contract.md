---
layout: doc
lang: fr
title: "quality-gates-evidence-contract"
description: "Use when producing or verifying the structured evidence log that attests quality gates (tests, build, mutation, commi..."
persona: tech-lead
---

# quality-gates-evidence-contract

> Schéma tech-agnostique qui atteste les portes qualité comme références falsifiables — SHAs Git, chemins de fichiers hachés, sorties d'outils capturées sur disque.

## Quand l'utiliser

- En phase COMMIT, pour que le `software-engineer` produise le journal de preuves `qg-{story}.json`
- Pendant la revue, pour que le `quality-gates-lens` vérifie les attestations sans ré-exécution
- Toujours chargé conjointement avec un adaptateur technique (`quality-gates-dotnet`, etc.)

## Contrat d'entrée

- Suite de tests complète exécutée, stdout capturé par le shell
- Snapshots RED et GREEN extraits via `git show` pour chaque cycle TDD
- `git rev-parse HEAD` comme référence racine du dépôt

## Contrat de sortie

- Fichier `qg-{story}.json` conforme au schéma `quality-gates-evidence/v1`
- Fichiers annexes dans `.copilot-tracking/skraft-plans/{projectSlug}/evidence/{date}/`
- Chaque porte G1-G9 avec `status`, `command_executed`, `exit_code_ref`, `stdout_ref`, `stdout_sha256`, `stdout_tail`
- Répertoire `snapshots/` contenant les paires `red-{n}-{file}` / `green-{n}-{file}`

## Invariants

- **Falsifiabilité** — chaque champ se résout depuis l'arbre Git sans ré-exécution
- **Pas de transcription manuelle** — stdout et sha256 sont produits par des outils shell, jamais dictés
- **`not_applicable` ≠ `fail`** — une porte inapplicable exige un champ `rationale` explicite
- **Intégrité RED→GREEN (G9)** — seules les lignes ajoutées sont autorisées entre RED et GREEN ; toute suppression ou mutation de ligne existante est une violation G9
- **Identifiants de portes fixes** — G1 à G9 uniquement ; l'ajout d'un identifiant est un changement de version de schéma
- **Porte masquée = `inconclusive`** — cacher un échec en omettant le log échoue encore plus durement côté lens

## Pourquoi cette forme

Le `quality-gates-lens` ne ré-exécute aucun outil ; il falsifie l'attestation contre l'arbre Git. Cette contrainte force le producteur à déposer des artefacts réels plutôt qu'à affirmer un résultat.

> « The two rules of TDD: write new code only if an automated test has failed; eliminate duplication. »
> — Beck, K., *Test-Driven Development by Example*, 2003.

Un journal de preuves manquant ou incohérent est traité comme `inconclusive` (NEEDS_REWORK), ce qui est plus bloquant qu'un `fail` honnête.

## Customisation autorisée

- Ajout de champs additionnels dans une porte existante (L2, rétrocompatible)
- Bump de version (`evidence/v2`) pour ajouter ou supprimer une porte (L3)
- Adaptateurs techniques personnalisés (`quality-gates-<stack>`) (L2)

## Voir aussi

- [quality-gates-dotnet]({{ "/fr/reference/skills/quality-gates-dotnet" | relative_url }}) — Adaptateur .NET
- [resolving-stack-commands]({{ "/fr/reference/skills/resolving-stack-commands" | relative_url }}) — Résolution des commandes de pile
- [software-engineer]({{ "/fr/reference/agents/software-engineer" | relative_url }}) — Producteur des preuves
