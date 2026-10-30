# skraft-backlog

The backlog half of SKRAFT, as a plugin of its own: find the issues worth working on — GitHub
issues or Azure Boards work items — classify them, and refine them into stories that clear the
Definition of Ready. It installs and
runs without the engineering plugin (`skraft`), and the engineering plugin runs without it.

User guides live in the [SKRAFT handbook](https://sebastiendegodez.github.io/skraft-plugin/en/) (FR and EN):
[The backlog](https://sebastiendegodez.github.io/skraft-plugin/en/explanation/backlog) explains the three paths and each planning lens;
[Turn a PRD into a GitHub backlog](https://sebastiendegodez.github.io/skraft-plugin/en/how-to/prd-to-backlog) and
[Refine a backlog issue](https://sebastiendegodez.github.io/skraft-plugin/en/how-to/refine-backlog) give the steps. This file keeps what the
plugin itself ships and how it behaves.

## Install

Both plugins are listed in this repository's marketplace.

In Claude Code:

```text
/plugin marketplace add SebastienDegodez/skraft-plugin
/plugin install skraft-backlog
```

In Copilot CLI, install `skraft-backlog` from the same marketplace, or install a clone
with `copilot plugin install ./plugins/skraft-backlog`. In VS Code, find it under `@agentPlugins` in the
Extensions view, or register a clone with `chat.pluginLocations`.

## What it ships

| Agent | Role |
|---|---|
| `backlog-discoverer` | Searches the issues (assigned to you, related to your recent changes, or by query), triages them (type, priority, Fibonacci effort), detects duplicates and proposes a sprint. |
| `backlog-planner` | Turns triaged issues into stories: a specific persona, three or more domain examples with real values, Given/When/Then acceptance criteria, a size, a milestone. |
| 7 lenses | Read-only reviewers the two producers dispatch at their review gate (3 for discovery, 4 for planning). |
| `backlog-slicer` | Dispatched by the `skraft-prd-backlog` workflow: cuts a PRD into epics, stories and milestones (`story-map.json`). |
| `story-writer` | Dispatched by the `skraft-prd-backlog` workflow: writes one story of the map in full (`stories/<id>.json`). |

Skills: `github-issue-search`, `azure-boards-work-items`, `issue-triage`, `issue-refinement`, `sprint-planning`,
`discovery-review-criteria`, `planning-review-criteria`, `backlog-review-lenses`,
`refinement-proposal`, `backlog-slicing`, `story-elaboration`.

## From a PRD to a GitHub backlog (dynamic workflow)

`skraft-prd-backlog` is a Copilot CLI dynamic workflow: it turns an approved PRD into epics as
tracking issues and INVEST stories that pass the Definition of Ready as their sub-issues, with
blocked-by links and milestones. Ask Copilot to run it with the PRD path:

```text
Run the skraft-prd-backlog workflow with prd docs/project-planning/my-prd.md
```

Its arguments (`prd`, `slug`, `repo`, `epics`, `approve`, `dryRun`, `frame`, `corrections`) and
the two pauses are described step by step in
[Turn a PRD into a GitHub backlog](https://sebastiendegodez.github.io/skraft-plugin/en/how-to/prd-to-backlog); any other key is refused. The
agents are the plugin's and run on the session's model.

| Phase | Who decides | What happens |
|---|---|---|
| INVENTORY | script | Reads every `FR`/`NFR`/`AC`/`CON`/`GOAL` id of the PRD and the epic each FR sits under. |
| SLICE | script, then a human | `backlog-slicer` writes `story-map.json`; a script first fixes what is mechanical (milestones written as strings or undeclared, the tracer flag on the first story of each epic, MoSCoW case, numeric effort), then checks coverage of every FR, ids, milestones, one tracer story per epic, and that `after` is acyclic and never points into a later milestone (three attempts). It warns on stories sized 8 or covering more than 4 FRs. The run pauses on `story-map.md`: edit `story-map.json` if needed, then resume. A map already on disk that passes the checks is reused (delete it to slice again). |
| ELABORATE | script | One `story-writer` per story, in parallel, into an existing `stories/` directory; a file already on disk that passes is reused. The script writes into each file what the map decides (`id`, `epic`, `milestone`, `moscow`, `covers`, `after`, `dependencies` rebuilt from `after` with the writer's reasons), then checks it against the Definition of Ready (persona, 3+ examples, 3–5 Given/When/Then criteria each derived from an example, tasks serving every criterion, dev notes, effort 1–8). When one check refuses at least half of the first drafts (3 or more), the run stops before any retry and names it. Files no step plans are removed and logged. |
| REVIEW | the four planning lenses and `review-verdict.mjs` | Per epic, in a `discuss` review of the stories that pass the checks; each story gets its own verdict, an approved story is not reviewed again; findings send back only the stories they name; three attempts. A dependency finding on a dependency the map declares and orders is dismissed; one on a dependency the map lacks holds the story and goes to `slice-proposals.json` (the `after` to add), never to the writer. A refused story is held back with every story that waits on it. |
| HANDOFF | a human | The HVE planning files under `.copilot-tracking/github-issues/prds/<slug>/`. The run pauses; check the Human Review box of `handoff.md`, then resume. Unchecked, nothing is published. |
| PUBLISH | script | Labels and milestones, then epics, stories, sub-issue and blocked-by links through `gh`. Every issue carries a hidden marker: a second run creates nothing twice. The repository must answer under the name asked for. |

Working files live in `.copilot-tracking/skraft-plans/<slug>/backlog/`. The workflow follows the
slicing of the BMAD method (tracer bullet, real prerequisites only, split never shrink), the
HVE functional planner and backlog manager (read-only planning, human-reviewed handoff,
operation order, destination binding, `{{TEMP-N}}` resolution) and the skraft Definition of
Ready and planning review.

### Reviewing the backlog in a canvas

The same extension declares the **skraft backlog** canvas. Ask Copilot to *"open the skraft backlog
canvas"*; the open input `{ slug?, story? }` picks a backlog and a story. The panel reads what the
workflow wrote, in two tabs.

**Progress** (the default, unless a story is named) shows the whole backlog: the key figures
(epics, stories, files written, refused, held back, ready, reviewed, published), the stories by
stage in one bar, then each epic in its own frame: its planning-review verdict and attempt, its
outcome, its done-when check, the findings on the epic itself, and its stories as rows (verdict,
ticks, state, covered requirements, dependencies, effort, MoSCoW). A row opens the story in Review.

**Review** shows each story as a pre-flight checklist:

- the six INVEST letters and the eight Definition of Ready items, each with the value it found;
- for a line that does not hold, why (the check or the lens finding, with its gate and severity)
  and how to fix it, and a link that scrolls the story sheet to the passage it accuses;
- the lens findings of the epic's last review, and why a story is refused or held back;
- a link to its epic, which opens Progress on the epic's frame.

The flight plan groups the stories by milestone, then by epic. Each epic head shows its review
verdict, its story counts and one cell per story, and folds; its stories hang from it. The filters
and the search are shared by both tabs. The top bar counts every story by
verdict. In a medium panel the plan stays beside the story; below 640 px it becomes a drawer.

The story dock, under the story's title, stays in sight while the checklist and the sheet scroll: it
holds the story's state, its tick index, **Answer** and **Mark reviewed**. Each open question of a
story can be answered in place, by a proposed answer or in words; the answer waits as a draft in
`answers.json` until the workflow runs again with `corrections: true` and writes it into the story
file. In Progress, a row with open questions ends with a question button that opens them; the
**Questions** filter and the launch bar count the stories that still ask.

The human marks each ready story **reviewed**. A review records the fingerprint of the file it read:
a story rewritten afterwards needs a new review. **Dry run** previews the GitHub creation of every
reviewed story, closed over the stories it waits on. **Create** then publishes exactly that
selection through the workflow's publisher; nothing is created twice. Reviewing and creating are
panel actions only. The agent can read the state, open a story, explain it and run the dry run
(`get_state`, `open_backlog`, `focus_story`, `explain_story`, `preview_creation`).

The canvas writes `review.json` (the reviews, and the repository chosen with `set_repo`, which a
new canvas keeps), `answers.json` (the draft answers) and `published.json` next to the backlog, and a
`handoff-logs-canvas-<time>.md` per creation. The panel follows the language of the PRD
(French or English). Its navy/cyan and paper palettes follow theme attributes **when the host
delivers them to the canvas document**, otherwise `prefers-color-scheme`.

This is an SDK canvas (`createCanvas` + `joinSession`), not the generic **Browser** canvas. The
runtime starts the extension's Node process; that process serves the panel on an ephemeral
loopback port. There is no additional Node command or dev server to start manually.
The extension declares `icon.png` for canvas discovery; the runtime resolves it relative to the
extension directory.

In [VS Code 1.142 (Preview)](https://code.visualstudio.com/updates/v1_142#_canvases-preview),
install the plugin through the Copilot app, enable `chat.canvases.enabled`, and start a **local
session with the Copilot harness**. Ask the agent to open **skraft backlog**. In the Agents
window, **Add Tab (+) > Canvas** also opens it.

#### Theme delivery and verification

- **Copilot app:** the host injects `data-theme-tone` / `data-color-mode` into the canvas document,
  not just its surrounding panel. The CSS accepts them on `html` or `body`, with tone taking
  precedence. A live observation on 2026-10-21 confirmed light → dark without reloading:
  `data-theme-tone="dark"`, `data-color-mode="dark"` and a navy background `rgb(15, 23, 34)`,
  while `matchMedia('(prefers-color-scheme: dark)').matches` remained `false`. No test script
  supplied those attributes.
- **VS Code 1.142:** there is no equivalent theme-attribute bridge in this release. Its
  [canvas service](https://github.com/microsoft/vscode/blob/1.142.0/src/vs/workbench/contrib/canvases/electron-browser/canvasService.ts)
  opens an isolated browser view; the
  [preload's theme handler](https://github.com/microsoft/vscode/blob/1.142.0/src/vs/platform/browserView/electron-browser/preload-browserView.ts)
  themes the element-picker overlays, not the canvas document. The panel therefore uses
  `prefers-color-scheme`, which normally follows the OS and **need not match the editor theme**.
  On macOS/Windows, VS Code's
  [`window.systemColorTheme`](https://github.com/microsoft/vscode/blob/1.142.0/src/vs/platform/theme/electron-main/themeMainServiceImpl.ts)
  can affect that native preference. The plugin does not change editor settings. This release
  path was inspected in source; it was not run locally (installed VS Code: 1.115).

The browser tests cover palette selection, live attribute changes, their removal and the media
fallback; they do not claim to test host injection. `light-dark()` requires Chromium 123+ or
Safari/WebKit 17.5+ (macOS 14.5+).

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
Steps and troubleshooting: [Refine a backlog issue](https://sebastiendegodez.github.io/skraft-plugin/en/how-to/refine-backlog).

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

The `skraft` orchestrator reads those two files, whoever wrote them. With the `skraft` plugin installed,
`/skraft backlog [criteria…]` under Copilot tells you the order: select `Skraft - Backlog Discoverer`, then
`Skraft - Backlog Planner`, then type `/skraft <slug> --from-artifacts`; each step waits for you and nothing
moves to development by itself. Under Copilot this plugin's `skraft-refine` command is
`/skraft-backlog:skraft-refine`. The planner itself accepts
`research/{date}/triage-ingest-{date}.md` instead of a discoverer triage when priorities come
from upstream planning.

## Writing to GitHub

Comments and labels go through the write route of `github-issue-search`: safe outputs in a
GitHub Agentic Workflows run, the GitHub MCP server otherwise, `gh` as the announced fallback.
An issue's title and body are never edited.

## Azure Boards

The agents and `/skraft-refine` work on Azure Boards when the forge is Azure DevOps: `forge`
(`"github"` or `"azure-devops"`) when you set it in `skraft-config.local.json`,
`skraft-config.json` or `~/.skraft/config.json`, in that order, as the engine reads it;
otherwise the host of the `origin` remote, or of the first remote without one
(`dev.azure.com`, `ssh.dev.azure.com`, `*.visualstudio.com`); GitHub without a remote. The
organization and the project come from that remote. The `azure-boards-work-items` skill then reads, comments, tags,
assigns iterations and links work items:

- **Azure DevOps MCP server first**, when you added it under the name `ado`. The agents are
  granted `mcp__ado__*` (Claude Code) and `ado/*` (Copilot); a server under another name is not
  reachable from them. Local server: `npx -y @azure-devops/mcp <organization>` (Node 20+); remote
  server: `https://mcp.dev.azure.com/<organization>` (Microsoft Entra ID; Claude Code needs an app
  registration). See
  [the server's documentation](https://learn.microsoft.com/en-us/azure/devops/mcp-server/remote-mcp-server).
- **`az` otherwise**: the Azure CLI with `az extension add --name azure-devops`, signed in with
  `az login` (or `az devops login` and a personal access token). The agent announces it.
- Neither: the agent keeps its local files and reports each write as pending.

skraft installs nothing, signs in to nothing and never edits a work item's title, description or
acceptance criteria. GitHub words map as follows: a label is a tag with the same text, a
milestone is the path of an existing iteration (none is created), a split story's sub-issues are
child work items, a duplicate gets a `Duplicate Of` link. Triage never writes Story Points,
Effort or Priority fields.

What stays GitHub-only:

| Piece | Why |
|---|---|
| The `skraft-refine` agentic workflow (`aw.yml`, `workflows/`) | It is a GitHub Agentic Workflow: GitHub Actions, issue events and safe outputs. On Azure Boards, run `/skraft-refine <id>` in your editor. |
| The **Weekly backlog triage** automation template | Its prompt is a GitHub search query; on Azure Boards, ask the discoverer for a search-based triage instead. |
| `skraft-prd-backlog` publication and the canvas **Dry run** / **Create** | The publisher creates issues, milestones and sub-issue links through `gh`. |
| Trusted marker authors | On GitHub a proposal counts only from an owner, member, collaborator or bot; Azure Boards has no such association, so any comment carrying the marker counts. |

## Development

```sh
node --test "tests/skraft-backlog/**/*.test.mjs"
node scripts/project-plugin-adapters.mjs --check --plugin-root plugins/skraft-backlog
```

Edit an agent in either tree, then `npm run plugin:sync`; the two trees and
`.agent-sync.json` follow the same rules as the engineering plugin (see the repository
`AGENTS.md`). The plugin is released together with `skraft`, under the same version.
