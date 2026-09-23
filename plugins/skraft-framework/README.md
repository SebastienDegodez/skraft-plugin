│   ├── agents/                      31 flat `.agent.md` synchronized descriptors
# SKRAFT plugin

Deterministic agentic software delivery for Claude Code and GitHub Copilot.

SKRAFT turns a refined story into researched, designed, executable, and reviewed
software changes. Specialized agents perform each engineering phase. Adversarial
reviewers challenge their outputs. Runtime hooks enforce phase order, required
skills, artifacts, verdicts, commits, and state integrity outside model reasoning.

## What this plugin provides

- One engineering entry point: `skraft-orchestrator`.
- Four ordered phases: `RESEARCH → DESIGN → DISTILL → DELIVER`.
- Dedicated specialists and reviewers for architecture, acceptance design, and implementation.
- Optional product workflows for backlog discovery and story refinement.
- Direct brownfield workflows for characterization and safe modernization.
- Outside-In TDD, BDD, Clean Architecture, mutation testing, contract testing, ADR,
  refactoring, and quality-evidence skills.
- Internal workers for mocking, contract testing, and refactoring.
- Deterministic hooks, persistent state, recovery data, and an append-only audit trail.

## Install

### Claude Code

Run these commands inside Claude Code:

```text
/plugin marketplace add SebastienDegodez/skraft-plugin
/plugin install skraft
```

### GitHub Copilot

For Copilot CLI, install `skraft` from this repository's marketplace, or load the
`plugins/skraft-framework` directory with `--plugin-dir` for local development.
The root [plugin.json](plugin.json) declares Agent Plugins v1 with no root `agents` list;
Copilot discovers the generated namespaced agents. In the CLI, select `skraft:skraft-orchestrator`.

Copilot CLI 1.0.74 introduced Open Plugin Spec v1 support. That does not imply
identical discovery or hook behavior across Copilot CLI, VS Code, and Claude Code.
This package declares the v1 schema and retains native compatibility manifests;
see the measured scope and pending checks below.

A Codex manifest exposes the shared plugin skills. Cursor has a marketplace entry but no
plugin manifest and no hooks in its format; it is unverified. The complete guarded agent
pipeline targets Claude Code and GitHub Copilot.

## Run the engineering pipeline

1. Select `skraft-orchestrator` in the agent picker.
2. Give it one refined story with acceptance criteria.
3. Let it resume or initialize the work item.
4. Review the artifacts and commits produced during each phase.

The orchestrator owns only engineering work:

```mermaid
flowchart LR
    D[Backlog Discoverer] --> P[Backlog Planner]
    P -. optional refined story .-> O[skraft-orchestrator]

    subgraph Engineering pipeline
        R[RESEARCH] --> A[DESIGN]
        A --> T[DISTILL]
        T --> I[DELIVER]
    end

    O --> R
```

`backlog-discoverer` and `backlog-planner` are optional, directly invocable product
workflows. They are not orchestrator children. Invoke them in that order when both are
needed, then pass the refined story to `skraft-orchestrator`.

Brownfield agents are also direct entry points:

- `brownfield-analyst` characterizes an existing system and composes modernization intent.
- `brownfield-harness-builder` captures current behavior through tests and contracts.
- `brownfield-refactorer` applies incremental Mikado or Strangler Fig changes.

## Engineering phases

| Phase | Specialist | Reviewer | Primary result |
|---|---|---|---|
| `RESEARCH` | `solution-researcher` | None | Research brief and constraints |
| `DESIGN` | `solution-architect` | `solution-architect-reviewer` | Architecture decisions and implementation shape |
| `DISTILL` | `acceptance-designer` | `acceptance-designer-reviewer` | Gherkin scenarios, test plan, and implementation plan |
| `DELIVER` | `software-engineer` | `software-engineer-reviewer` | Tested code, quality evidence, and verified commits |

Reviewers are read-only. A rejected result returns to its specialist; it never silently
advances to the next phase.

## Markdown reports in PR comments (integration in progress)

Reporting makes the artifact flow visible: approved DISTILL scenarios and test plan
become a **forecast**; DELIVER code, quality evidence and persisted review become an
**outcome**, including when delivery is blocked. The approved protocol maintains two
stable PR comments per story/report identity, updating them rather than adding one
per retry. Forecast means planned tests and expected impact, not passing tests.
Outcome compares expected and actual impact, with recorded checks, metrics, changes
and limitations. Missing proof is not success; delivery is not deployment.

The approved extraction gives [qa-reporting](skills/qa-reporting/SKILL.md) ownership of
report preparation guidance, the canonical [report data contract](skills/qa-reporting/references/report-contract.md)
and bundled `forecast` / `outcome` Markdown templates.
Scripts render those templates from reviewed inputs; the skill does not run tests,
decide gates or publish comments. Generated data, reports and receipts stay in the
consumer project's resolved tracking directories, never in the installed skill.
No company override, profiles, new configuration key or reporting agent is introduced.
Template integration and default-output parity remain pending validation.

At startup, the user selects full PR reports, issue `link` / `full` / `none`, and
whether to receive a chat summary. PR full + issue link + chat summary is recommended,
not silently enabled. Confirmed repository, branch, targets and `maxMedia` persist
under `userPreferences.reporting` through the state service and survive resume.
`maxMedia` is an explicit non-negative choice, including zero; there is no hard default.
Changed target scope requires renewed confirmation, not inference from the active PR.

No PR/MR yet means pending publication. Draft creation requires explicit user approval
and a suitable operation exposed by the host; any push requires separate scoped consent
and real branch changes. The reporting CLI does neither. Once a PR/MR exists, its
confirmed identity is saved again before publication.

The [reporting CLI](src/cli/report.mjs) renders and validates locally; the orchestrator
owns remote publication through the host. For GitHub, the shipped
[github-search-protocol](skills/github-search-protocol/SKILL.md) is the canonical
transport procedure: MCP first, announced host `gh` fallback only when MCP or a
required capability is unavailable under the skill's policy. No external companion
skill is required. Azure DevOps/GitLab remain MCP-only reporting targets, not a promise
of full engineering-pipeline support. The shared [publication lifecycle](assets/reporting/mcp-publication.md)
owns local command usage, handoff contracts and recovery; GitHub operations stay in
the canonical skill rather than being repeated here.

Publication receipts compare host readback locally; they are **not independent
network verification by scripts**. Provider mappings have local fixture tests only;
live provider availability and end-to-end host integration remain unverified.

A full issue report reuses the rendered body; link mode is prepared only after a
matching PR/MR receipt supplies its returned comment URL. A publication-only failure
retains local Markdown and per-target status, including after `DONE`. Missing URLs
leave issue pointers pending rather than inventing permalinks. Recovery reuses saved
reports without rerunning tests, mutation, capture or review. Abandoning an unresolved
local attempt requires explicit human confirmation and a reason; it preserves receipts
and neither cancels nor undoes a remote write.

Reports are **Markdown comment content**, not uploaded files or hosted reports. For
frontend work, existing producers capture Playwright evidence and reviewers validate
it. Only already remotely accessible evidence is linked; local-only evidence is stated
as unavailable remotely. The selected media cap limits report links, not evidence
retained for review. No automatic upload, hosting or attachment quota is introduced.
Recorded reviewer verdicts remain distinct from the renderer's local proof checks;
the current renderer leaves Git-object verification to the reviewer.

No new reporting agent or review panel is added. Existing specialists own plans,
impact interpretation and evidence; the orchestrator routes local commands and host
calls. Body reuse avoids per-destination synthesis, not transmission or readback work;
no measured token savings or price is claimed. See the maintainer-only
[QA skill Genesis handoff](../../docs/superpowers/plans/2026-09-19-qa-reporting-skill.md)
for definitive reduced scope, interfaces and pending validation; the
[earlier reporting plan](../../docs/superpowers/plans/2026-09-17-pr-markdown-reporting.md)
retains publication history.

## Runtime guardrails

| Guard | What the user gets | Failure mode |
|---|---|---|
| G1 | Out-of-order phase dispatch blocked before execution | Fail closed |
| Provenance | An agent never dispatches itself, nor an agent another agent owns | Fail open on hook error |
| G2 | Mandatory skills injected on agent start | Fail open on hook error |
| G3 | Skill reads recorded; a subagent that never loaded a mandatory skill is sent back | Fail open on hook error |
| G4 | A phase does not close until its required artifacts exist (state CLI) | Fail closed |
| G5 | A phase does not close unless the review artifact, the recorded verdict and, for DELIVER, a new commit agree (state CLI) | Fail closed |
| G6 | Next-phase or retry context injected after a dispatch | Fail open on hook error |
| G7 | Direct writes to state, execution logs and the active-pipeline pointer blocked | Fail closed |
| G8 | Source and test writes during DELIVER restricted to the DELIVER agents and the agents they dispatch | Fail open on hook error |

Off-pipeline agents and internal workers are intentionally not subject to G1 phase ordering.
Missing or corrupt pipeline state still blocks a governed phase.

Every guard is covered by unit and acceptance tests; only the G7 shell refusal has a live
harness receipt so far. See the [hooks reference](../../docs/site/en/reference/infrastructure/hooks.md#verification-status).

## State and artifacts

SKRAFT persists work under:

```text
.copilot-tracking/skraft-plans/{project-slug}/
├── research/
├── plans/
├── features/
├── details/
├── changes/
├── reviews/
├── state.json
└── execution-log.json
```

Each artifact becomes context for the next phase. `state.json` is a deterministic runtime
contract, not an editable planning document. Use the state CLI instead of modifying it
directly:

```bash
node "<plugin-root>/src/cli/state.mjs" get --slug my-feature
node "<plugin-root>/src/cli/health-check.mjs"
```

Run these from the consumer repository so SKRAFT resolves that repository's tracking
state. Hook commands use `CLAUDE_PLUGIN_ROOT`; actual Copilot CLI 1.0.83 fixtures verified
its expansion, including paths with spaces. Full live VS Code v1 validation remains unverified.

Repository configuration lives in `skraft-config.json`. The supported tracking layout is
`namespaced`; quality thresholds and engineering invariants are deliberately not user-relaxable.

## Harness packaging

One canonical source set feeds native packaging surfaces:

```text
plugins/skraft-framework/
├── plugin.json                      canonical v1 schema; no root agents list
├── .claude-plugin/plugin.json        explicit registration of all 31 agents
├── com.github.copilot/
│   ├── agents/                      31 flat `.agent.md` synchronized descriptors
│   ├── hooks/hooks.json             generated exact copy of root hooks
│   └── rules/                       native path-scoped rules
├── com.anthropic.claude-code/
│   └── agents/                      31 flat editable native Claude `.md` descriptors
├── hooks/hooks.json                 canonical source; Claude compatibility
├── skills/                         shared skills
└── src/                            shared zero-dependency runtime
```

Copilot loads path-scoped rules natively. Claude's `SubagentStart` hook resolves the
canonical agent identity and injects only rules declared by that agent. Catalogue,
configuration, and evaluation scans read the Copilot runtime tree only, preserving
original provenance metadata without counting a logical agent twice.

The Claude [manifest](.claude-plugin/plugin.json) must enumerate **all 31** individual
native runtime agents, including workers and reviewer lenses, for registration and delegation.
Claude rejects directory paths in `agents`. Never delete internal agents from this list to hide
them. Internal `user-invocable: false` flags remain byte-preserved, but that field is not
documented for Claude **subagents**; it does not promise hiding in Claude's picker.

Six standalone roots are intended public Copilot entry points: `skraft-orchestrator`,
`backlog-discoverer`, `backlog-planner`, `brownfield-analyst`, `brownfield-harness-builder`,
and `brownfield-refactorer`. Internal agents remain available for delegation.

Shared agents use a scalar `model` value. VS Code's fallback-array syntax is not
portable to Copilot CLI and can silently remove an agent from discovery.

VS Code **1.126** actual source currently falls back through `.plugin` then `.claude-plugin`.
Full live v1 validation is unverified; this is not a reason to omit the root `$schema`.
The `rules` field is retained for VS Code; Claude Code ignores it and reports a
validation warning. Claude rule injection remains the responsibility of the hooks.

Actual Copilot CLI **1.0.83** fixture tests **passed** namespaced agent discovery and
`SessionStart` / `PreToolUse` with `CLAUDE_PLUGIN_ROOT`, including paths with spaces.
[scripts/copilot-hook-smoke.mjs](../../scripts/copilot-hook-smoke.mjs) also **passed** against
the current migrated plugin installed from the local marketplace checkout, with exact CLI
**1.0.83** pinned via `--cli` and an isolated `COPILOT_HOME`: **PASS allowed** (1 hook audit
entry), **PASS denied** (1 hook audit entry), forbidden write absent. This verifies the probed
SKRAFT refusal, not the full six-root picker, hidden-subagent invocation, model IDs, general
tool permissions, or the full engineering pipeline. Full live VS Code validation remains unverified.

Hooks have one source and two physical surfaces: canonical [hooks/hooks.json](hooks/hooks.json)
for Claude compatibility and generated [com.github.copilot/hooks/hooks.json](com.github.copilot/hooks/hooks.json)
for Copilot v1. No extra manifest `hooks` pointers: do not register either auto-loaded surface twice.
These are current packaging facts, recorded in [ADR-009](../../docs/adr/adr-009-generated-copilot-hook-copy.md);
[ADR-008](../../docs/adr/adr-008-single-hook-manifest.md), which it supersedes, retains its measured
legacy record, not a current cross-client guarantee.

## Maintainer workflow

Run commands from repository root.

Edit either `com.github.copilot/agents/<id>.agent.md` or
`com.anthropic.claude-code/agents/<id>.md`. These are the only two editable runtime trees.
`plugin:sync` merges body and description against `.agent-sync.json` v2 using stable basename IDs
and per-side normalized shared fields. It translates Markdown destinations for the receiving
client, preserves native name/model/tools/agents and all other header bytes, and rejects
conflicting edits before writing anything. Unchanged differential prose stays client-local.
Never reset a baseline to accept unexplained drift. New IDs require both explicitly authored
client versions; sync does not invent native tools or clone broad permissions.
Edit hooks in the root source. Run `npm run plugin:sync` and `npm run plugin:check`, which invoke
[scripts/project-plugin-adapters.mjs](../../scripts/project-plugin-adapters.mjs) with `--apply`
and `--check`. `plugin:build` is an alias for the same synchronization, not native generation.
Commit both runtime descriptors, shared baseline and generated hook copy together:
marketplace Git installs do not run a build.
Keep the Claude manifest's full agent list synchronized when adding or removing agents.

After changing an agent, regenerate the guardrail config:

```bash
node plugins/skraft-framework/src/cli/build-config-bin.mjs
```

Before opening a pull request:

```bash
npm run paths:check
node plugins/skraft-framework/src/cli/build-config-bin.mjs --check
node plugins/skraft-framework/src/cli/resolve-model-bin.mjs --check
node --test "tests/skraft-framework/**/*.test.mjs"
npm run ci:local
```

Tests live in `tests/skraft-framework/<feature>/`, with unit tests, acceptance tests and fixtures grouped by feature. Agent sources are the two runtime trees above.
Generated catalogue, evaluation, dashboard, and graph outputs must not be committed.

## Documentation

- [SKRAFT handbook](https://sebastiendegodez.github.io/skraft-plugin/en/)
- [Repository architecture](https://github.com/SebastienDegodez/skraft-plugin/blob/main/docs/architecture.md)
- [Roadmap](https://github.com/SebastienDegodez/skraft-plugin/blob/main/docs/roadmap.md)
- [Skill evaluation](https://github.com/SebastienDegodez/skraft-plugin/blob/main/docs/skill-evaluation.md)
- [Contributing rules](https://github.com/SebastienDegodez/skraft-plugin/blob/main/AGENTS.md)

## License

GPL-3.0-or-later. See the
[repository license](https://github.com/SebastienDegodez/skraft-plugin/blob/main/LICENSE).
