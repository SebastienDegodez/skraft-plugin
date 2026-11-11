# Maintaining the SKRAFT plugin

Packaging facts and the maintainer workflow, moved out of the README.

## Harness packaging

One canonical source set feeds native packaging surfaces:

```text
plugins/skraft-framework/
├── plugin.json                      canonical v1 schema; no root agents list
├── .claude-plugin/plugin.json        explicit registration of all 31 agents
├── com.github.copilot/
│   ├── agents/                      31 flat `.agent.md` synchronized descriptors
│   └── hooks/hooks.json             generated copy of root hooks, `${PLUGIN_ROOT}`
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

Current VS Code source detects the v1 `$schema` first, loads `com.github.copilot/hooks/hooks.json`
and interpolates only `${PLUGIN_ROOT}` there, then falls back through `.plugin` then `.claude-plugin`.
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

## Client compatibility

### Tool declaration checks

Run the declaration checks from the repository root:

```bash
node --test tests/skraft-framework/plugin-packaging/agent-tools.unit.test.mjs
```

The checks cover both plugins and three target profiles: VS Code Local,
Copilot SDK and Claude Code. Local and Copilot use the Copilot descriptors;
Claude uses its native descriptors. Block lists and inline lists must preserve
the same tool boundary. Missing declarations, duplicate entries, wrong value
types, unknown references and unresolved restricted Claude agent IDs fail.

The supported references are a bounded SKRAFT contract, not every tool a host
could provide. VS Code references are checked against upstream revision
`d9cccddf6b34357c58b5bbfb60ea03d4c4d1df65` and the
[custom agent reference](https://code.visualstudio.com/docs/agents/reference/custom-agent-file-reference#tools).
Claude names follow the [tools reference](https://code.claude.com/docs/en/tools-reference)
and [subagent format](https://code.claude.com/docs/en/sub-agents#frontmatter-reference).
Verify new references against those sources before extending the supported set.

MCP namespaces are reported as external dependencies, not verified installed
tools. The versioned Claude contract reports `TaskOutput` as historical:
Claude Code removed it in 2.1.277; newer hosts use `Read` on the background
output file. Passing declaration tests does not establish support on those
newer hosts. Existing descriptors are not migrated by this check.

These are offline contract tests using SKRAFT's YAML reader, not executions of
the three harness parsers. They neither reproduce the Configure Tools UI nor
prove that a running agent receives its declared tools. Repeat the fresh-session
probe below separately for Local, Copilot SDK and the supported Claude version;
record failures and version limits rather than treating static success as a
live compatibility result.

### Native capabilities and read-only review

Research and architecture authors declare native file editing and execution:
Copilot `edit/createFile`, `edit/editFiles`, `execute/runInTerminal`; Claude
`Write`, `Edit`, `Bash`. Their output and source-write boundaries are unchanged.
These declarations are not evidence that a particular SDK host exposes them.
Do not replace native identifiers with guessed SDK names.

The DESIGN, DISTILL and DELIVER reviewers and their lenses have no file-writing
tools or general terminal. Reviewers return their canonical verdict YAML.
The orchestrator prepares the structural scan, deterministic evidence
verification and Git inputs, then passes the returned verdict unchanged to
the existing `artifact.mjs review-verdict` renderer. It checks the file before
recording the review or verdict through `state.mjs`. Schema errors return to
the reviewer; IO errors stop progression. Builds, tests, mutation runs and
producer-owned evidence remain the specialist's responsibility.

Standalone reviewer calls return YAML too; an authorized caller must render
it before using it as persisted pipeline evidence. A response alone cannot
close a phase.

For a VS Code Copilot SDK tool gap, record the VS Code build, plugin revision,
selected descriptor URI, tool-reference translation and actual tool schema
from a fresh invocation. Compare that exact probe with other users before
attributing a difference to Windows or macOS. Native Copilot chat, SDK chat
and CLI discovery are different validation targets.

After source validation, explicitly load the corrected local plugin in a new
session using the target host's plugin loader; editing this checkout does not
reload installed descriptors or existing subagents. Never patch an installed
cache as a substitute for source validation. In an isolated temporary workspace,
check that an author reads, creates, edits and executes a harmless command;
check that a reviewer reads and returns YAML without write or terminal tools;
then check parent-owned persistence and both allowed and denied hooks. Clean
the witness files. Record the loaded descriptor path and revision with results.
Until that fresh-session test passes, SDK compatibility remains unverified.

Copilot CLI 1.0.74 introduced Open Plugin Spec v1 support. That does not imply identical
discovery or hook behavior across Copilot CLI, VS Code, and Claude Code. This package declares
the v1 schema and retains native compatibility manifests. The root [plugin.json](plugin.json)
declares Agent Plugins v1 with no root `agents` list; Copilot discovers the generated
namespaced agents (`skraft:skraft-orchestrator` in the CLI).

A Codex manifest exposes the shared plugin skills. Cursor has a marketplace entry but no plugin
manifest and no hooks in its format; it is unverified. The complete guarded agent pipeline
targets Claude Code and GitHub Copilot.

Root hook commands use `CLAUDE_PLUGIN_ROOT`; the generated Copilot v1 copy uses `PLUGIN_ROOT`,
the only root VS Code interpolates for v1 plugins. Actual Copilot CLI 1.0.83 fixtures verified
`CLAUDE_PLUGIN_ROOT` expansion, including paths with spaces. Full live VS Code v1 validation
remains unverified.
