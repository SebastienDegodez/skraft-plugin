---
layout: doc
lang: en
title: "playwright-evidence"
description: ">"
persona: tech-lead
---

# playwright-evidence

> Captures E2E test evidence (screenshots, videos, traces) and stores them under `.copilot-tracking/skraft-plans/{projectSlug}/changes/{date}/evidence/{story}/evidence/` for agents to consume.

## When to use

- Setting up Playwright evidence capture for a story in the DELIVER phase
- Capturing screenshots, videos, and traces on E2E test failure
- Generating an `manifest.md` evidence manifest that orchestrator agents read
- Configuring the CI pipeline to upload evidence as an artefact

## Entry contract

- Playwright (TypeScript) project configured with `playwright.config.ts`
- `SKRAFT_STORY_ID` environment variable set (e.g. `42-add-eligibility-check`)
- `@playwright/test` installed, Chromium available

## Exit contract

- Screenshots in `evidence/screenshots/{test-title}-{timestamp}.png` (on failure)
- Videos in `evidence/` (mode `retain-on-failure`)
- Traces in `evidence/traces/trace.zip` (mode `retain-on-failure`)
- HTML report in `evidence/reports/index.html`
- `manifest.md` listing all captured files with type, path, and associated test

## Invariants

- **Path convention** — `.copilot-tracking/skraft-plans/{projectSlug}/changes/{date}/evidence/{story}/evidence/` — `{story}` comes from `SKRAFT_STORY_ID`, consistent with all other SDLC artefacts
- **Scope of this skill: capture, name, store, list** — publishing is the orchestrator agent's responsibility
- **Capture on failure only** — do not accumulate artefacts on passing tests (`retain-on-failure`)
- **CI retention** — `retention-days: 7` on `upload-artifact`; add the `evidence/` directory to `.gitignore`

## Why this shape

The story key (`{story}` = `SKRAFT_STORY_ID`) makes the manifest unambiguous when multiple stories run in sequence. The orchestrator reads the manifest by resolving `state.md` to get the active story — no hardcoded path knowledge required. The `manifest.md` structures: run timestamp, overall status, duration, and a file table (type | path | test).

> « Evidence is the record of what the system did. The manifest is how agents consume it. »

## Allowed customisation

- Additional reporters (JUnit, list, etc.) (L1)
- Video window size (default: 1280×720) (L1)
- CI retention duration (default: 7 days) (L2)
- Tracing options (`screenshots`, `snapshots`, `sources`) (L2)

## See also

- [outside-in-tdd]({{ "/en/reference/skills/outside-in-tdd" | relative_url }}) — TDD cycle whose E2E tests produce this evidence
- [quality-gates-evidence-contract]({{ "/en/reference/skills/quality-gates-evidence-contract" | relative_url }}) — Evidence contract that this skill feeds
- [software-engineer]({{ "/en/reference/agents/software-engineer" | relative_url }}) — DELIVER agent that configures and runs this skill
