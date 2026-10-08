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

Run it yourself with the `/skraft-refine <issue number>` command (Claude Code, Copilot CLI,
VS Code), on your own model and credentials; add `--force` to redo an issue already covered.

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

## The skraft-refine agentic workflow

The same refinement, as a [GitHub Agentic Workflow](https://github.github.com/gh-aw/). Install
it in a repository with:

```sh
gh aw add SebastienDegodez/skraft-plugin/plugins/skraft-backlog@v<version>
```

`gh aw add` reads [aw.yml](aw.yml): it installs `workflows/skraft-refine.md`, its import
`shared/apm.md` (Microsoft APM, which brings the plugin's skills to the runner, pinned to the
same tag) and `.github/workflows/shared/skraft-refine-marker.mjs`, creates the `skraft-refine`
label, and compiles the workflow. Set the engine secret (`COPILOT_GITHUB_TOKEN` for the
Copilot engine) in the repository or the organization.

| Trigger | How |
|---|---|
| New issue | `issues: opened` |
| Label | add `skraft-refine`; it is removed again so it can be re-added |
| Comment | `/skraft-refine`, or `/skraft-refine --force` |
| By hand | Actions → skraft-refine → Run workflow, with `issue_number` and `force`; or `gh workflow run skraft-refine.lock.yml -f issue_number=42 -f force=true` |

The workflow reacts 👀, then a pre-activation step runs the marker check: an issue a trusted
proposal already covers, for its current title, body and the installed version, is skipped.
The agent's GitHub tools are read-only; its only write is one comment through safe outputs,
and older proposals of the workflow are hidden. The slash command and the label go through the
`agentic_commands.yml` dispatcher that `gh aw compile` generates next to it.

Who pays: a workflow run uses the repository's or organization's engine secret. To run a
refinement on your own subscription, use `/skraft-refine` in your editor; the comment carries the
same marker, so the workflow then skips the issue.

By default only users with write access or above trigger gh-aw workflows: an issue opened by an
outside contributor starts nothing until a maintainer adds the label or comments the command.
Opening `roles` to everyone exposes the agent to whatever an issue body says.

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
