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
| `backlog-slicer` | Dispatched by the `skraft-prd-backlog` workflow: cuts a PRD into epics, stories and milestones (`story-map.json`). |
| `story-writer` | Dispatched by the `skraft-prd-backlog` workflow: writes one story of the map in full (`stories/<id>.json`). |

Skills: `github-issue-search`, `issue-triage`, `issue-refinement`, `sprint-planning`,
`discovery-review-criteria`, `planning-review-criteria`, `backlog-review-lenses`,
`refinement-proposal`, `backlog-slicing`, `story-elaboration`.

## From a PRD to a GitHub backlog (dynamic workflow)

`skraft-prd-backlog` is a Copilot CLI dynamic workflow: it turns an approved PRD into epics as
tracking issues and INVEST stories that pass the Definition of Ready as their sub-issues, with
blocked-by links and milestones. Ask Copilot to run it with the PRD path:

```text
Run the skraft-prd-backlog workflow with prd docs/project-planning/my-prd.md
```

Arguments: `prd` (required), `slug`, `repo` (`owner/repo`, default: the repository of the working
directory), `epics` (elaborate only these), `approve` (skip the story-map pause), `dryRun`
(simulate the publication), `agentIds`, `models` (`{ "story-writer": "<Copilot model>" }`).

| Phase | Who decides | What happens |
|---|---|---|
| INVENTORY | script | Reads every `FR`/`NFR`/`AC`/`CON`/`GOAL` id of the PRD and the epic each FR sits under. |
| SLICE | script, then a human | `backlog-slicer` writes `story-map.json`; a script checks coverage of every FR, ids, milestones, one tracer story per epic, and that `after` is acyclic and never points into a later milestone (three attempts). The run pauses on `story-map.md`: edit `story-map.json` if needed, then resume. |
| ELABORATE | script | One `story-writer` per story, in parallel; a script checks each file against the Definition of Ready (persona, 3+ examples, 3–7 Given/When/Then criteria each derived from an example, tasks serving every criterion, dev notes, dependencies equal to the map's `after`, effort 1–8). |
| REVIEW | the four planning lenses and `review-verdict.mjs` | Per epic, in a `discuss` review; findings send back only the stories they name; three attempts. A refused story is held back with every story that waits on it. |
| HANDOFF | a human | The HVE planning files under `.copilot-tracking/github-issues/prds/<slug>/`. The run pauses; check the Human Review box of `handoff.md`, then resume. Unchecked, nothing is published. |
| PUBLISH | script | Labels and milestones, then epics, stories, sub-issue and blocked-by links through `gh`. Every issue carries a hidden marker: a second run creates nothing twice. The repository must answer under the name asked for. |

Working files live in `.copilot-tracking/skraft-plans/<slug>/backlog/`. The workflow follows the
slicing of the BMAD method (tracer bullet, real prerequisites only, split never shrink), the
HVE functional planner and backlog manager (read-only planning, human-reviewed handoff,
operation order, destination binding, `{{TEMP-N}}` resolution) and the skraft Definition of
Ready and planning review.

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
| Label | add `skraft-refine`; the label stays, so remove it and add it again to ask again |
| Comment | a comment whose first word is `/skraft-refine`, or `/skraft-refine --force` |
| By hand | Actions → skraft-refine → Run workflow, with `issue_number` and `force`; or `gh workflow run skraft-refine.lock.yml -f issue_number=42 -f force=true` |

These are plain GitHub events, not gh-aw's `slash_command` and `label_command` triggers: those
only start on a command at the start of the issue body and cannot share a workflow with
`issues: opened`. Every issue comment therefore starts the pre-activation job for a few
seconds; its marker check reads the event and stops there unless the comment starts with
`/skraft-refine` on an issue (not a pull request), the label is `skraft-refine`, or the run was
started by hand.

The check then reads the issue: a closed issue, a pull request, or an issue a trusted proposal
already covers — for its current title, body and the installed version — is skipped. Only a
run that goes on reacts 👀 to the issue or the comment. The agent's GitHub tools are
read-only; its only write is one comment through safe outputs, aimed at the issue number the
check resolved, and older proposals of the workflow are hidden. The proposal ends with a small
`skraft-refine v=… hash=…` line: gh-aw strips HTML comments from what it posts, so the marker
the next run looks for is visible.

Who pays: a workflow run uses the repository's or organization's engine secret. To run a
refinement on your own subscription, use `/skraft-refine` in your editor; the comment carries the
same marker, so the workflow then skips the issue.

By default only users with write access or above trigger gh-aw workflows: an issue opened by an
outside contributor starts nothing until a maintainer adds the label or comments the command.
Opening `roles` to everyone exposes the agent to whatever an issue body says.

## VS Code automation templates

Two templates appear under **Templates from Plugins** in the Agents window; neither is enabled
until you create an automation from it and choose its model and permissions.

| Template | Schedule | Runs |
|---|---|---|
| Weekly backlog triage | Monday 08:45, local time | the backlog discoverer on the issues assigned to you |
| Refine the proposed sprint | manual | the backlog planner on the latest sprint proposal |

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
