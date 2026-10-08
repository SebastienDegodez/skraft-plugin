# skraft-backlog

The backlog half of SKRAFT, as a plugin of its own: find the GitHub issues worth working on,
classify them, and refine them into stories that clear the Definition of Ready. It installs and
runs without the engineering plugin (`skraft`), and the engineering plugin runs without it.

## Install

Both plugins are listed in this repository's marketplace.

In Claude Code:

```text
/plugin marketplace add SebastienDegodez/skraft-plugin
/plugin install skraft-backlog
```

In Copilot CLI, install `skraft-backlog` from the same marketplace, or load
`plugins/skraft-backlog` with `--plugin-dir`. In VS Code, find it under `@agentPlugins` in the
Extensions view, or register a clone with `chat.pluginLocations`.

## What it ships

| Agent | Role |
|---|---|
| `backlog-discoverer` | Searches the issues (assigned to you, related to your recent changes, or by query), triages them (type, priority, Fibonacci effort), detects duplicates and proposes a sprint. |
| `backlog-planner` | Turns triaged issues into stories: a specific persona, three or more domain examples with real values, Given/When/Then acceptance criteria, a size, a milestone. |
| 7 lenses | Read-only reviewers the two producers dispatch at their review gate (3 for discovery, 4 for planning). |

Skills: `github-issue-search`, `issue-triage`, `issue-refinement`, `sprint-planning`,
`discovery-review-criteria`, `planning-review-criteria`, `backlog-review-lenses`,
`refinement-proposal`.

## Refinement proposal for one issue

`refinement-proposal` reviews a single issue and posts its proposal as one comment, in the
issue's language: the Definition of Ready of the issue as written, a ready or
needs-refinement verdict, a Fibonacci size with its capacity days, the problems in the current
acceptance criteria (vague, not testable, technical…), a proposed story with domain examples
and Given/When/Then criteria, related issues, and the gaps against the PRD or BRD the issue
links under `docs/`. A document the issue does not link is listed as one to confirm, never
used.

Its scripts do everything that must not depend on the model:

| Script | Does |
|---|---|
| `refine-marker.mjs` | Decides whether the issue still needs a proposal: a trusted comment carries a hidden marker with the plugin version and a hash of the issue's title and body. |
| `resolve-docs.mjs` | Finds the PRD and BRD under `docs/`: linked ones are used, related ones are candidates. |
| `check-proposal.mjs` | Validates the proposal and derives readiness, the DoR tally and the capacity days. |
| `render-comment.mjs` | Renders the comment in French or English headings, Gherkin keywords in the issue's language, with the marker first. |

## The review gate

Each producer reviews its own output without judging it: it dispatches every lens of its phase
with only the inputs that lens may see, saves their JSON answers, and runs
`skills/backlog-review-lenses/scripts/review-verdict.mjs`. The script computes the verdict
(`APPROVED`, `NEEDS_REWORK`, `REJECTED`) from the lens findings and writes the review file. A
missing or inconclusive lens never reads as approval. Three refused attempts stop the run.

The producers dispatch the lenses themselves, so no sub-agent dispatches another: the gate works
in VS Code with `chat.subagents.allowInvocationsFromSubagents` left at its default.

## Hand-off to the engineering pipeline

The two plugins share files, not code. `backlog-planner` writes, under
`.copilot-tracking/skraft-plans/{projectSlug}/plans/{date}/`:

- `stories-{milestone}.md` — the milestone, its sprint plan and its stories;
- `ac-draft-{story}.md` — one story with its acceptance criteria and DoR checklist.

The `skraft` orchestrator reads those two files, whoever wrote them. The planner itself accepts
`research/{date}/triage-ingest-{date}.md` instead of a discoverer triage when priorities come
from upstream planning.

## Writing to GitHub

Comments and labels go through the write route of `github-issue-search`: safe outputs in a
GitHub Agentic Workflows run, the GitHub MCP server otherwise, `gh` as the announced fallback.
An issue's title and body are never edited.

## Development

```sh
node --test "tests/skraft-backlog/**/*.test.mjs"
node scripts/project-plugin-adapters.mjs --check --plugin-root plugins/skraft-backlog
```

Edit an agent in either tree, then `npm run plugin:sync`; the two trees and
`.agent-sync.json` follow the same rules as the engineering plugin (see the repository
`AGENTS.md`). The plugin is released together with `skraft`, under the same version.
