# Maintaining the SKRAFT plugin

Packaging facts and the maintainer workflow. The contributor rules are in
[AGENTS.md](../../AGENTS.md); the design, including the Copilot driver contract, is explained on the
[Architecture](../../docs/website/docs/explanation/architecture.md) page of the handbook, and the
repository layout in [docs/architecture.md](../../docs/architecture.md). User documentation lives
in the handbook only (`docs/website/`, FR and EN, structure in `docs/website/book.yml`); this file
does not repeat it.

## Packaging

One source set feeds every host:

```text
plugins/skraft-framework/
├── plugin.json                       Agent Plugins v1 schema; no root agents list; declares the Copilot extension
├── .claude-plugin/plugin.json        explicit registration of all 19 agents for Claude Code
├── hooks/hooks.json                  declares the Claude Code mod module, nothing else
├── hooks/skraft-mod.tsx              the mod module: `$` wiring, one line per call
├── com.github.copilot/
│   ├── agents/                       19 flat `.agent.md` descriptors
│   ├── commands/skraft.md            the `/skraft` command for Copilot (Claude Code keeps the mod's `/skraft`)
│   └── extensions/skraft-pipeline/   the Copilot extension: the `skraft-pipeline` workflow and `skraft_decide`
├── com.anthropic.claude-code/agents/ 19 flat native Claude Code `.md` descriptors
├── engine/                           domain, application, infrastructure, drivers
├── workflows/                        pipeline.skraft.dot, review.skraft.dot
├── schemas/                          skraft-config.json and skraft-config.local.json schemas
├── types/                            index.d.ts: the values the mod keeps in `$.state`
├── skills/                           self-contained skills, scripts inside
└── assets/                           shared templates the engine pre-creates outputs from
```

V2 ships **no command hooks**. `hooks/hooks.json` holds `{ "modules": ["./skraft-mod.tsx"] }`
and must hold nothing else. A hook comes back only under the re-entry criterion of [AGENTS.md](../../AGENTS.md) (Engine rules).

The Claude Code [manifest](.claude-plugin/plugin.json) enumerates every agent, lenses and the
refuter included: Claude Code rejects directory paths in `agents`. Never delete an internal agent
from this list to hide it; internal agents keep `user-invocable: false`.

`skraft-orchestrator` is this plugin's only public entry point. The backlog and brownfield
agents ship in their own plugins (`skraft-backlog`, `skraft-brownfield`), which share no
runtime code with this one.

A Claude Code agent file names a Claude Code alias or `inherit`; a Copilot agent file names no
model. The configuration chooses each agent's model family at run time.

### Hosts

| Host | Driver | Entry |
|---|---|---|
| Claude Code | `engine/drivers/claude-mod/` | `hooks/skraft-mod.tsx`: `/skraft`, the `run_pipeline` tool, the Skraft pane |
| Copilot CLI | `engine/drivers/copilot-workflow/` | `com.github.copilot/extensions/skraft-pipeline/extension.mjs`, the only file that imports the SDK |
| VS Code, with the Copilot SDK | `engine/drivers/copilot-sdk/` | `skraft-run.mjs`, started from a terminal or a task |
| VS Code, without it | `engine/drivers/cli/` | `skraft next` / `skraft record`, conducted by `skraft-orchestrator` |

What the Copilot driver assumes of the host is measured by `npm run probe:copilot` and recorded,
with the CLI version, in [docs/v2/host-verification.md](../../docs/v2/host-verification.md).

## Maintainer workflow

Run commands from the repository root.

### Agents

Edit either `com.github.copilot/agents/<id>.agent.md` or `com.anthropic.claude-code/agents/<id>.md`;
these are the only two editable trees. Then run `npm run plugin:sync` and `npm run plugin:check`
([scripts/project-plugin-adapters.mjs](../../scripts/project-plugin-adapters.mjs) with `--apply`
and `--check`). Sync merges body and description against `.agent-sync.json` under stable basename
IDs, translates Markdown links for the receiving client, keeps every client-specific header and
refuses conflicting edits before writing anything. A new agent needs both client versions written
by hand, and an entry in the Claude Code manifest. Commit both trees and the baseline together:
marketplace Git installs do not build.

A change to an agent or a skill is judged with Vally (`eng/run-vally-evals.sh`): the steps are in
[Evaluate a skill](../../docs/website/docs/how-to/evaluate-a-skill.md), the runner, verdicts and CI in
[Evaluation tooling](../../docs/website/docs/reference/evaluation-tooling.md).

### Skills

A skill carries every script it runs. `npm run skills:sync` refreshes the declared copies of a
script shared by several skills; `npm run skills:check` fails on drift.

### Engine

```bash
npm ci --prefix plugins/skraft-framework/engine
npm run test:engine               # unit (use cases with InMemory doubles) and integration (real infrastructure, drivers on a simulated host)
npm run lint:engine               # function size and complexity limits
npm run mutation:engine:changed   # Stryker on the engine lines changed since integration/v2-next
```

Tests never live inside `plugins/`: they are under `tests/skraft-framework/unit/<feature>/` and
`tests/skraft-framework/integration/<feature>/`.

### Before a pull request

```bash
npm run skills:check && npm run plugin:check && npm run backlog:check
node scripts/agent-policy/build-config-bin.mjs
node scripts/agent-policy/resolve-model-bin.mjs --check --forbid-model
npm run test:engine
claude plugin validate plugins/skraft-framework
node tests/skraft-framework/integration/claude-mod/run-plugin-test.mjs
node scripts/local-ci.mjs
```

Generated catalogue, evaluation, dashboard and graph outputs are never committed.
