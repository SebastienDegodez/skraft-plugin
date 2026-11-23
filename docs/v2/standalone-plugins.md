# Standalone design and delivery plugins

`skraft-design` and `skraft-deliver` are independently installed plugins. Neither imports
`skraft-framework` or the other plugin. Their only interchange is versioned architecture
documents merged into the project's base branch. `skraft-framework` remains unchanged.

## Architecture brief v1

A story brief lives at `docs/architecture/stories/<number>-<slug>.md`. Its first block is
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
a valid brief or an explicit blocked reason. New ADRs remain Proposed on the branch and become
Accepted with `ratified_by: "architecture PR merge"` only if that PR is merged; no separate
ADR ratification is asked. A Proposed ADR already on the merge base is not accepted by this run.

For GitHub epic discovery, terminal sub-issues are stories; do not nest technical tasks
under those stories. Azure DevOps uses its native story types. An entirely excluded scope
stops without publishing an empty architecture PR.

## Merged-base reads

Delivery resolves the configured base branch on the configured remote, obtains its commit,
and reads briefs, cited documents and ADR status from that immutable commit. It never uses
working-tree contents as merged architecture. It copies those inputs into its own tracking
folder for subsequent agent reads and resume.
Its `architecture/context.json` maps source paths to those snapshots and records the
merged commit. Producers and reviewers resolve architecture only through that mapping.
With no brief, the manifest records `mode=absent`; no prior DESIGN document or ADR is required.

An unmerged brief is refused as `architecture-unmerged`. A cited ADR with `Superseded` or
`Rejected` status is refused as `architecture-stale`; any status other than `Accepted` is
also refused. A changed issue body asks a human to `KEEP` the brief or `REDESIGN`; the latter
stops delivery and points to design, without invoking it. With no brief, delivery records a
notice and starts at DISTILL, never RESEARCH or DESIGN. Forge and repository identity must
match, so another repository's issue with the same number is not accepted.

## Isolation and hosts

| Surface | Design | Delivery |
| --- | --- | --- |
| Install identity | `skraft-design` | `skraft-deliver` |
| Team configuration | `skraft-design-config.json` | `skraft-deliver-config.json` |
| Local configuration | `skraft-design-config.local.json` | `skraft-deliver-config.local.json` |
| User settings and journal keys | `~/.skraft-design/` | `~/.skraft-deliver/` |
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
