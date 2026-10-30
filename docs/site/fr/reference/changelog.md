---
layout: doc
lang: fr
title: "Changelog"
---

# Changelog

> Les changements visibles par l'utilisateur, regroupés par version ; le détail commit par commit est dans `CHANGELOG.md` à la racine du dépôt.

## V2 — 2.0.0-alpha.1 à 2.0.0-alpha.18 (2026-10-28 → 2026-10-29) {#v2}

### Changements incompatibles {#v2-breaking}

| Version | Changement |
| --- | --- |
| alpha.1 | Le plugin ne livre plus de hook de commande ni la CLI d'état et d'artefacts de la v1 : le moteur V2 les remplace. `events.jsonl` remplace `state.json`. |
| alpha.1 | `skraft-config.json` décrit des composants (racine, stack, chemins, commandes). `skraft migrate` convertit la configuration et les runs v1 en cours. |

### Moteur et pipeline {#v2-engine}

| Version | Changement |
| --- | --- |
| alpha.1 | Moteur à cas d'usage ; journal `events.jsonl` chaîné et signé (`skraft journal adopt`) ; un seul pilote par run (bail de session). |
| alpha.1 | Le pipeline est un workflow DOT : RESEARCH, DESIGN, DISTILL, DELIVER, PUBLISH ; `skraft workflow eject`, `check`, `diff` ; revues en fan-out, un nœud par lentille ; nœuds verrouillés et obligatoires. |
| alpha.1 | La revue DELIVER appelle `review.skraft.dot` ; les workflows éjectés vivent dans `.skraft/`. |
| alpha.1 | Revue en code : lentilles en parallèle, réfutation par `finding-refuter`, verdict calculé par le moteur. |
| alpha.1 | Gates de commandes par composant ; barre de mutation 100 % cœur / 80 % frontière jugée par le moteur, survivants traités fichier par fichier. |
| alpha.1 | Décisions humaines : nœud question, `skraft decide`, ratification des ADR, question `environment`. |
| alpha.1 | Graphe du run, revues et gates dans `skraft status`, le panneau et `qa-report.md`. |
| alpha.2 | Les agents reçoivent le corps de l'issue de leur story. |
| alpha.5 | Le brief et `skraft doctor` nomment les skills de composant introuvables ; le rejeu d'un commit rouge voit ses dépendances et reconnaît un rouge e2e. |
| alpha.6 | Le nettoyage des rejeux reconnaît sous Windows les worktrees nommés par leur nom long. |
| alpha.7 | Messages fixés par le code, sortie coupée signalée, coût approximatif, logs de `skraft doctor --run`. |
| alpha.9 | Rejeu dans les workspaces npm et pnpm. |
| alpha.13 | Un run bloqué pose la question `blocked` : une consigne relance le nœud, `STOP` termine le run. |
| alpha.15 | Un ADR `Proposed` se réécrit sur place ; toute question humaine est posée par le moteur. |
| alpha.16 | `skraft doctor` et le run montrent le modèle de chaque agent sous l'hôte qui le lance. |
| alpha.16 | Le moteur ne cherche plus Docker : un test qui a besoin d'un conteneur échoue comme un autre. |

### Fin de run et pull requests {#v2-publish}

| Version | Changement |
| --- | --- |
| alpha.1 | Le run se termine par une pull request en brouillon décrite depuis le journal ; `skraft publish` l'ouvre plus tard. |
| alpha.1 | Captures Playwright claires et sombres d'un front end dans la pull request. |
| alpha.1 | Un commentaire de progression sur l'issue de la story, à chaque phase et à la fin. |
| alpha.1 | `skraft review --pr` revoit une pull request seule avec le workflow `review`. |
| alpha.12 | Sections de preuves repliées dans la pull request ; ce qui attend un humain reste ouvert. |

### Hôtes {#v2-hosts}

| Version | Changement |
| --- | --- |
| alpha.1 | Claude Code : commande `/skraft`, outil `run_pipeline`, panneau Skraft et ses boutons de réponse. |
| alpha.1 | Copilot CLI : workflow dynamique `skraft-pipeline`, outil `skraft_decide`. |
| alpha.1 | VS Code : pilote SDK Copilot (`skraft-run.mjs`) et boucle de repli `skraft next` / `skraft record`. |
| alpha.5 | Copilot CLI : le canvas `skraft-pipeline` dessine la vue du run. |
| alpha.8, alpha.10 | Copilot CLI : chaque phase, puis la revue, s'ouvre dans l'hôte avant ses agents. |
| alpha.11 | Copilot CLI : une confirmation que Copilot ne montre pas renvoie au chat ou au terminal. |
| alpha.17 | Copilot CLI : une question est posée une seule fois, dans le chat ; le canvas montre l'état du run, en lecture seule. |

### Skills et plugins {#v2-skills}

| Version | Changement |
| --- | --- |
| alpha.1 | Plugin `skraft-brownfield` autonome. |
| alpha.1 | `skraft-backlog` : workflow `skraft-prd-backlog` (corrections mécaniques en code, revue story par story, création épic par épic). |
| alpha.3, alpha.4 | `quality-gates-*` : rapport de mutation là où le moteur le lit ; une passe sans source cœur changée passe la gate mutation. |
| alpha.5 | Skill `clean-architecture-typescript` pour un back end Node/TypeScript. |
| alpha.9 | .NET : gates, noms des projets de test et gabarits d'architecture. |

### Documentation {#v2-docs}

| Version | Changement |
| --- | --- |
| alpha.18 | Site de documentation versionné ; la doc de `integration/v2-next` est publiée. |

## v1 — Migration des ADRs (2026-06)

- Les ADRs sortent de `docs/adr/` et sont consolidés dans `docs/adr/`.
- Le script `scripts/migrate-adr-layout.mjs` renomme les fichiers en séquence globale (`adr-001-...md`, `adr-002-...md`, etc.) et réécrit les liens de référence.
- Utilisation recommandée:

```bash
node scripts/migrate-adr-layout.mjs \
	--repo /chemin/vers/repo \
	--renumber-global

# appliquer réellement
node scripts/migrate-adr-layout.mjs \
	--repo /chemin/vers/repo \
	--renumber-global \
	--apply
```

- Le mode par défaut est `dry-run`; vérifier le résumé avant d’ajouter `--apply`.
- Après migration, vérifier `docs/adr/supersessions.md` et les références `ADR-*` dans les artefacts DESIGN.

## v0 — Bootstrap (2026-05)

- Création du site de documentation publique SKRAFT.
- Pages : landing, pipeline, architecture, concepts, customisation, référence agents et skills.
- Lint des citations intégré.
