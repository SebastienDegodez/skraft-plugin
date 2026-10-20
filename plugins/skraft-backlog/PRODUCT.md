# Product

<!-- impeccable:product-schema 1 -->

Scope: the `skraft-backlog` plugin, and its backlog canvas in particular. Facts marked
*(inferred)* come from the repository and the original request; the owner was not available to
confirm them.

## Platform

web

## Users

- **Primary** *(inferred)*: the product owner or lead who turns an approved PRD into a GitHub
  backlog. They run the `skraft-prd-backlog` workflow, then review story by story what it produced.
  Before anything reaches GitHub, they need to know which stories hold, and why the others do not.
- **Secondary** *(inferred)*: the team in a refinement session, sharing one screen.

## Product Purpose

The `skraft-prd-backlog` workflow slices a PRD into epics and stories, writes each story, and
reviews it against INVEST and the Definition of Ready (DoR) with four review lenses. The canvas makes
that result readable:
- where each story sits on the story map;
- whether it holds against each INVEST letter and each of the eight DoR items, and why not;
- what the lenses found.

The human marks the stories they have reviewed, previews the GitHub creation as a dry run, then
launches it.

Success: no story reaches GitHub without a human having reviewed it. Every refusal can be traced to a
named check, with the evidence behind it.

## Positioning

Every verdict comes from a check, never from a model's opinion:
- the story-file checks of `prd-backlog/story.mjs`;
- the story-map checks of `prd-backlog/story-map.mjs`;
- the lens findings, scored by `review-verdict.mjs`.

The canvas shows the check and its evidence, not a score.

## Operating Context

- **Where it opens**: inside the GitHub Copilot app, as a canvas panel next to the chat, while the
  workflow runs or after it pauses on the handoff review.
- **What it reads**:
  - the working files under `.copilot-tracking/skraft-plans/<slug>/backlog/`;
  - the HVE handoff files under `.copilot-tracking/github-issues/prds/<slug>/`.
- **How issues are created**: through `gh`, with the same idempotent publisher as the workflow.

## Capabilities and Constraints

- **Human-only gate**: reviewing stories and creating issues are human actions in the panel. Agents
  can read, explain, focus a story and run a dry-run preview, but never review or create.
- **Selection rule**: a creation covers reviewed, ready stories only. A story is created together with
  every story it waits on, or not at all.
- **Dry run first**: a dry-run preview of the exact selection must precede the creation.
- **Language** *(inferred)*: the interface follows the language of the PRD, French or English.
- **Stack**: plain HTML, CSS and ES modules served by the extension's loopback server, with no build
  step and no dependency (repository convention).

## Brand Commitments

The skraft identity of the documentation site (`docs/site/assets/css/design-tokens.css`):
- cyan accent `#24b5ff` / `#7fd3ff` on deep navy `#0f1722`;
- Lato for text, Fira Code for code.

*(inferred)* The canvas follows the host's light or dark theme.

## Evidence on Hand

- **Synthetic data**: a synthetic eligibility PRD with its story map and story files, under
  `tests/skraft-backlog/prd-backlog/fixtures/`.
- **Real data**: the approved Skwad PRD (14 epics, 294 FR) is the real-size target. No real backlog
  has been published yet.

## Product Principles

1. A verdict without its evidence is noise: always show the check and the value it found.
2. Readiness is per story, creation is per closed set: never orphan a story's dependencies.
3. Nothing reaches GitHub on a model's say-so.
4. Dense but calm: a reviewer reads dozens of stories in one sitting.
