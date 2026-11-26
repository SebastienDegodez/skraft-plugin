# Standalone design and delivery plugins

`skraft-design` and `skraft-deliver` are independently installed plugins. Neither imports
`skraft-framework` or the other plugin. Their only interchange is versioned architecture
documents merged into the project's base branch. `skraft-framework` remains unchanged.

## Architecture brief v1

The architecture lasts by bounded context: `docs/architecture/context-map.md` and its
`## Glossary`, then `docs/architecture/contexts/<context>/tactical-design.md` and
`docs/architecture/contexts/<context>/event-model/<slice>.md`. A design run refuses a document it
creates elsewhere; one an earlier run left at an older path keeps it.

A story brief lives at `docs/architecture/runs/<run>/<number>-<slug>.md` (an earlier run's at
`docs/architecture/stories/<number>-<slug>.md` still reads). Its first block is
an HTML comment containing JSON:

```markdown
<!-- skraft-architecture-brief:v1
{
  "version": 1,
  "issue": 42,
  "forge": "github",
  "repository": "owner/project",
  "bodySha256": "<SHA-256 of the issue body, with CRLF normalized to LF>",
  "components": ["api"],
  "criteria": [
    { "id": "AC-1", "components": ["api"], "adrs": ["docs/adr/adr-001-checkout.md"] }
  ],
  "adrs": ["docs/adr/adr-001-checkout.md"],
  "documents": ["docs/architecture/context-map.md"]
}
-->

# Checkout

Story-specific design and mapping of acceptance criteria to components and decisions.

- docs-relied-on: docs/architecture/context-map.md, docs/adr/adr-001-checkout.md
- consistency-gate: PASS
```

`forge` is `github` or `azure-devops`. `repository` is the repository identity returned by
the selected forge. Component and criterion identifiers are non-empty, unique strings.
GitHub.com uses `owner/repository`; GitHub Enterprise prefixes its canonical host,
`host/owner/repository`. Azure DevOps uses `organization/project/repository`.
Every criterion references declared components and ADRs. Empty ADR lists are valid; no ADR
is invented merely to fill a brief. Document paths are repository-relative Markdown paths
under `docs/architecture/`, `docs/adr/` or `docs/domain/event-model/`, without traversal,
backslashes or fragments. Shared architecture documents contain no issue or criterion references.
ADRs retain their existing files and lifecycle; there is no consolidated `architecture.md`.

The design engine supplies the body fingerprint and forge identity from the issue it read,
not from a model's assertion. Before publication it verifies every selected story has either
a valid brief or an explicit blocked reason. New ADRs are marked Accepted on the branch with
`ratified_by: "architecture PR merge"` and take effect only if that PR is merged; no separate
ADR ratification is asked. A Proposed ADR already on the merge base is not accepted by this run.

For GitHub epic discovery, terminal sub-issues are stories; do not nest technical tasks
under those stories. Azure DevOps uses its native story types. An entirely excluded scope
stops without publishing an empty architecture PR.

## Questions and modes

When a choice belongs to the product owner, the architect writes it to
`details/open-questions.json` (id, story, criterion, question, two or more options with their
consequence, the option it assumed) and designs the rest of the pass on that assumption; a story it
cannot design at all goes to `details/blocked-stories.json`. Before the review, the run waits on one
`architecture-questions` decision holding every question; a full set of answers runs DESIGN again
once, and STOP ends the run.

`skraft_design_start` takes `mode`, `interactive` by default or `ci`. An interactive run asks its
questions through the host's native chat. A CI run that waits on a person publishes its draft pull
request itself, the pending question in its body, and asks each question in a comment of its own
there, its marker naming the question's key (`<!-- skraft-design:question:v1 key=… -->`); while its
branch holds no commit (GitHub opens no pull request without one), it pushes the branch and asks in
a comment on the issue or epic instead. A question is posted once, never rewritten by the next one;
once a person answered it, the engine rewrites its comment to say what it recorded, and the pull
request's decisions list every answer. A scope question stops it at once. A
`/skraft-answer` comment (then one `Q1: B` line per question, one option, or one JSON object; the
key may be left out) is recorded by `engine/drivers/cli/ci-reply.mjs`, without a model, only
when the forge says its author has `admin`, `maintain` or `write` access, with the provenance
`pr-comment`. Between the pausing and the resuming job, the run's tracking folder travels as a
workflow artifact and the journal is signed with the `SKRAFT_DESIGN_JOURNAL_KEY` repository
secret. `ci/skraft-design.yml` is the workflow a project copies.

A run keeps the default branch it started from, its research and `plans/components.json`. A
person who sees the default branch moved while the run waited (a merged back end, a new
configuration) answers `REFRESH` to its blocking question (`blocked`, `architecture-blocked`), in
chat or with `/skraft-answer REFRESH`. In the same run and journal, the engine takes the default
branch into the run's branch (a fast-forward while it holds no commit of its own, a merge commit
otherwise), journals `run.refreshed` with both commits, detects the components again and starts
again from RESEARCH, each node keeping its count of visits. A merge conflict is undone and asks
the person to merge the branch themselves, then answer REFRESH again. A delivery offers no
REFRESH.

Once every pass of a run is accepted, the engine rewrites each of its briefs at `"version": 2`
with `"pins"`: the SHA-256 of each cited document's text, newlines normalised. Delivery refuses a
brief whose pinned document reads otherwise on the merged base (`architecture-stale`, naming the
file). A brief at version 1, without pins, still reads.

Before its pull request, a design run lists the other open `design/*` branches of origin and
what each changes since it left the merged base. One that changes a context folder this run
changes asks a person (`architecture-concurrent`: CONTINUE or STOP); two pull requests could
otherwise each merge without a conflict and still change what the other designed.

## Merged-base reads

Delivery resolves the configured base branch on the configured remote, obtains its commit,
and reads briefs, cited documents and ADR status from that immutable commit. It never uses
working-tree contents as merged architecture. It copies those inputs into its own tracking
folder for subsequent agent reads and resume.
Its `architecture/context.json` maps source paths to those snapshots and records the
merged commit. Producers and reviewers resolve architecture only through that mapping.
With no brief, the manifest records `mode=absent`; no prior DESIGN document or ADR is required.

A brief delivery cannot rely on does not refuse the run: it pauses it for a design. That is an
unmerged brief (`architecture-unmerged`), a cited ADR with any status other than `Accepted`
(`architecture-stale`), an invalid brief, or a changed issue body for which a human answered
`REDESIGN` rather than `KEEP`. Only a merged base Git cannot read refuses. Forge and repository
identity must match, so another repository's issue with the same number is not accepted.

## Light design

With no brief merged for its story, delivery records a notice and writes
`plans/light-design.json`: the story's identity, the path of its brief
(`docs/architecture/runs/<run>/<number>-<slug>.md`) and the components it may cite. The
workflow's `architecture_mode` node, answered by the engine, then leads to `light_design`
instead of DISTILL; it never runs RESEARCH. `deliver-light-designer` writes the brief, in the
same v1 format, and an ADR only for a decision that passes the eligibility gate. It writes
nothing else: no document of `docs/architecture/` but its brief, no code, no test.

The engine checks each attempt as it checks any other: the brief reads, carries the engine's
identity, cites only the plan's components and existing files, and cites each ADR it relies on,
`Accepted` or written by this light design; every ADR it wrote is cited, under a number no open
`design/*` branch gives another ADR. The ADR checks of every step apply as well.

`light_design_review` then settles it. With no ADR, no assumption in its `## Assumptions` and
nothing beyond a light design, the engine approves it; an assumption is shown to the person, who
answers it with REVISE. Beyond a light design means, each read without a model: an ADR that replaces
or amends a decision already taken, a bounded context the brief marks `(new)`, more than two
ADRs, more than eight criteria, more than three components, more than two bounded contexts in its
`## Context` or more than six use cases in its `## Use cases`. Otherwise a person reads each ADR's
decision and each reason: `APPROVED` marks the ADRs Accepted on the branch, effective on the
merge of the delivery pull request, `REVISE` runs the light design again with their words,
`DESIGN` pauses the delivery, `STOP` ends it. The engine keeps the SHA-256 of each ratified ADR
(`plans/ratified-adrs.json`) and refuses any later attempt that changes or deletes one: what the
person ratified is what the pull request merges. An approved brief is bound as `mode=light` in `architecture/context.json`, read by
DISTILL, DELIVER and their lenses as a merged one, and leaves the branch before the pull request
as a merged one does.

A paused delivery waits on `design_wait`. Each visit reads the merged base again: a brief merged
for the story since is bound without a question, and the light brief and unratified ADRs leave
the branch in one engine commit. Otherwise a person answers `RESUME` once skraft-design merged
its pull request and the delivery branch is checked out again, `CONTINUE` to deliver on a light
design, or `STOP`. skraft-deliver never starts skraft-design: the two plugins share nothing but
the merged documents.

## Isolation and hosts

| Surface | Design | Delivery |
| --- | --- | --- |
| Install identity | `skraft-design` | `skraft-deliver` |
| Team configuration | `skraft-design-config.json`, optional | `skraft-deliver-config.json` |
| Local configuration | `skraft-design-config.local.json` | `skraft-deliver-config.local.json` |
| User settings, publication consent per repository, journal keys | `~/.skraft-design/` | `~/.skraft-deliver/` |
| Tracking | `.copilot-tracking/skraft-design-runs/` | `.copilot-tracking/skraft-deliver-runs/` |
| Workflow overrides | `.skraft-design/` | `.skraft-deliver/` |
| Agent identifier prefix | `design-` | `deliver-` |
| Internal skill prefix | `design-` | `deliver-` |
| Forge comment prefix | `skraft-design` | `skraft-deliver` |
| MCP tool prefix | `skraft_design_` | `skraft_deliver_` |
| Working branch | `design/issue-<n>` or `design/epic-<n>` | `deliver/issue-<n>` |

Each tracking root owns its mandatory `.active-slug`, signed `events.jsonl` journal, run
lease and agent handover files. No mutable state is shared. The engines preserve configured
component commands, quality thresholds, write scopes and publication consents.

Claude Code and Copilot use the same MCP handover loop: start, next, dispatch the exact
listed agents, save their replies, record, repeat. A host reconnect resumes the same run;
it never selects a run by guessing its folder. Questions use native `ask_user` or
`askQuestions`; only the returned human answer is relayed. Missing or dismissed native
questions leave the run paused. Workers never dispatch workers. No user CLI is installed.
The MCP process and internal bounded `git`, `gh`, `az` and configured gate commands are not
user-facing entry points.

## One engine source

Each plugin installs alone, so each ships its engine. `plugins/skraft-design/engine` is the
source; `plugins/skraft-deliver/engine` is its copy, every `design` name written as the delivery
plugin's (`skraft-deliver`, `skraft_deliver_`, `SKRAFT_DELIVER_`, `deliver-`), `design-records`
kept. Change a shared file in the source only, then `npm run standalone:sync`;
`npm run standalone:check`, which CI runs, fails on a copy that differs from its source.

`scripts/standalone-engine.json` lists what is not copied:

- `ownedBySource`, `ownedByCopy`: the files only one plugin has (the design run, the delivery run).
- `ownedByBoth`: the files each plugin writes its own version of: its MCP tools, server and run
  driver, the DESIGN records check, and the two modules the shared pipeline asks what a plugin
  adds (`application/architecture/checkpoint.mjs`, `publish-research.mjs`), which skraft-deliver
  writes as doing nothing.
- `pending`: shared files whose two versions still differ, each to merge into the source; none
  since #621 was reconciled.

Behaviour one plugin needs and the other never reaches stays in the shared file when it acts only
on what that plugin records: a delivery's brief retirement acts on a brief the delivery accepted,
the Gherkin checks run only for a workflow that writes scenarios.
