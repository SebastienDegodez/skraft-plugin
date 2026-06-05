---
layout: doc
lang: en
title: "Getting Started"
persona: software-engineer
---

# Getting Started

## Prerequisites

- **VS Code** with the **GitHub Copilot** extension enabled
- **Node.js** (≥ 18) for validation scripts

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/SebastienDegodez/skraft-plugin.git
cd skraft-plugin
```

### 2. Install the agent package manager (optional)

If you use external plugins, install [apm](https://github.com/anthropics/agent-package-manager):

```bash
npm install -g @anthropic/apm
apm install
```

### 3. Open in VS Code

Agents are auto-discovered from the `.github/agents/` directory. No additional configuration is needed.

### 4. First run

Type `/skraft` in Copilot Chat to launch the orchestrator. It automatically detects the project state and resumes from the last persisted phase.

### 5. Follow the DISCOVER → DELIVER flow

Assign yourself a GitHub issue, then let the orchestrator guide you through the six phases:

1. **DISCOVER** — Triage and prioritization
2. **DISCUSS** — Refinement into user stories
3. **DESIGN** — Architecture and ADRs
4. **DISTILL** — BDD scenarios
5. **DELIVER** — TDD implementation

Each phase is validated by a dedicated reviewer before moving to the next.

→ See the [phase details]({{ "/en/explanation/pipeline/" | relative_url }}) for more information.
