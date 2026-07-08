---
layout: doc
lang: en
title: "skraft-config"
description: "Initializes and configures the repo-wide SKRAFT settings file (skraft-config.json) — chiefly the depthTier strictness dial that governs the whole pipeline."
persona: tech-lead
---

# skraft-config

> Initializes and edits `skraft-config.json` — the **repository-wide** settings file whose central key is `depthTier`, the strictness dial that governs the TDD variant, mutation thresholds, reviewer lens count, and Gherkin gate across every phase of the pipeline.

## When to use

- When initializing a new SKRAFT repository (`configure skraft`, `skraft-config init`)
- To change the repository strictness level (`set depth tier`, `change strictness`)
- Once per repository — `depthTier` is a repository decision, not a per-task choice
- Never for per-task settings — those live in `state.json` via the state CLI

## Entry contract

- Read/write access to the repository root
- `depthTier` choice confirmed with the user (or `comprehensive` as default)
- Optional `SKRAFT_CONFIG_ROOT` to override the base directory

## Exit contract

- `skraft-config.json` created or updated at the repository root
- `depthTier` persisted as one of `{basic, standard, comprehensive, custom}`
- `depthTierRationale` persisted when the chosen tier is below `comprehensive`
- Confirmation displayed to the user, e.g. `Repo depth tier set to 'standard' (was comprehensive).`

## Invariants

- **Determinism S7** — every read and write of a governed key goes through `config.mjs`; never hand-edit `skraft-config.json` for `depthTier` / `depthTierRationale`
- **`comprehensive` by default** — any reduction requires an explicit decision with rationale
- **Mandatory A9 sequence** — init → choose → set → verify; do not skip the verify step
- **Unknown keys rejected** — `config.mjs set` returns exit code 3 for any ungoverned key
- **`custom` not managed by `config.mjs set`** — `customDepth` is a structured field edited directly
- **Atomic backup** — the CLI preserves ungoverned fields and backs up before writing

## Why this shape

A repository-wide configuration file prevents silent quality-level drift between runs. Passing `depthTier` through dispatch context (rather than letting each agent read the file) guarantees consistency and auditability.

> « The goal of software architecture is to minimize the human resources required to build and maintain the required system. »
> — Martin, R. C., *Clean Architecture*, 2017.

The separation between repository parameters (`skraft-config.json`) and per-task parameters (`state.json`) follows the single-responsibility principle: each file has exactly one owner and one scope.

## Allowed customisation

- `depthTier` choice (`basic`, `standard`, `custom`) with rationale (L1)
- `customDepth` per gate when `depthTier: custom` — edited directly in `skraft-config.json` (L2)
- `SKRAFT_CONFIG_ROOT` to point to a different base directory (L1)

## See also

- [skraft-difficulty-routing]({{ "/en/reference/skills/skraft-difficulty-routing" | relative_url }}) — 3-axis routing at DISCOVER exit; depth tier table
- [craft-discipline]({{ "/en/reference/skills/craft-discipline" | relative_url }}) — Software craft discipline that relies on pipeline invariants
