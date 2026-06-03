---
layout: doc
lang: fr
title: "Démarrage rapide"
persona: software-engineer
---

# Démarrage rapide

## Prérequis

- **VS Code** avec l'extension **GitHub Copilot** activée
- **Node.js** (≥ 18) pour les scripts de validation

## Installation

### 1. Cloner le dépôt

```bash
git clone https://github.com/SebastienDegodez/skraft-plugin.git
cd skraft-plugin
```

### 2. Installer le gestionnaire de paquets agents (optionnel)

Si vous utilisez des plugins externes, installez [apm](https://github.com/anthropics/agent-package-manager) :

```bash
npm install -g @anthropic/apm
apm install
```

### 3. Ouvrir dans VS Code

Les agents sont auto-découverts depuis le répertoire `.github/agents/`. Aucune configuration supplémentaire n'est nécessaire.

### 4. Premier lancement

Tapez `/skraft` dans le chat Copilot pour lancer l'orchestrateur. Il détecte automatiquement l'état du projet et reprend depuis la dernière phase persistée.

### 5. Suivre le flux DISCOVER → DELIVER

Assignez-vous une issue GitHub, puis laissez l'orchestrateur vous guider à travers les six phases :

1. **DISCOVER** — Triage et priorisation
2. **DISCUSS** — Raffinement en user stories
3. **DESIGN** — Architecture et ADR
4. **DISTILL** — Scénarios BDD
5. **DELIVER** — Implémentation TDD

Chaque phase est validée par un reviewer dédié avant de passer à la suivante.

→ Consultez le [détail des phases](/fr/pipeline/) pour approfondir.
