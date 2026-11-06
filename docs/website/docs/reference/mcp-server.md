---
title: "The skraft MCP server"
description: "The plugin's MCP server: how a host starts it, its tools and prompts, which a host is offered, the folder a tool works in and the refusals."
persona: software-engineer
---

# The skraft MCP server

The skraft plugin ships an MCP server that offers the [skraft commands](./cli.md) to an agent host as tools: each tool runs the command line it stands for, in the same process, and answers what that command prints.

Why the engine decides and a driver only executes: [Architecture](../explanation/architecture.md).

:::caution[Not verified on V2]
Only GitHub Copilot CLI 1.0.105 has been measured loading this server: it reads `mcp.json`,
starts the server once and is not offered the agent loop. Under VS Code and Claude Code, the
manifest, the name the host gives at the handshake and the names under which any host shows
the tools and prompts are read in specifications and sources, not observed.
:::

## How a host starts it <!-- #start -->

The host starts the server when it loads the plugin; a person never types it. The line it runs
is `node "<plugin folder>/engine/drivers/cli/skraft.mjs" mcp`.

| Host | Manifest | Plugin folder in the line |
| --- | --- | --- |
| GitHub Copilot CLI, VS Code | `mcp.json` at the plugin root (Agent Plugins 1.0.0) | `${PLUGIN_ROOT}` |
| Claude Code | `mcpServers` of `.claude-plugin/plugin.json` | `${CLAUDE_PLUGIN_ROOT}` |

The server speaks JSON-RPC 2.0 over stdin and stdout, one message per line, protocol versions
`2025-11-25`, `2025-06-18`, `2025-03-26` and `2024-11-05`. It writes nothing but the protocol on
stdout; its log goes to stderr. It stops when the host closes stdin, once the calls still running
end.

## Tools <!-- #tools -->

Every tool also takes `workspace` ([the folder a tool works in](#workspace)). Its answer is the
command's stdout, then its log; it is an error only when the command failed without printing an
answer, so a failing doctor or gate still answers its JSON.

| Tool | Arguments | Command line | Offered to |
| --- | --- | --- | --- |
| `skraft_doctor` | `run?`, `base?` | `doctor [--run] [--base <ref>] --json` | every host |
| `skraft_init` | `add?` (folders) | `init [--add <folder>]...` | every host |
| `skraft_start` | `slug`, `issue?`, `title?`, `base?`, `fromArtifacts?` | `init <slug> [--issue <n>] [--title <t>] [--base <ref>] [--from-artifacts]` | VS Code |
| `skraft_next` | — | `next --json` | VS Code |
| `skraft_record` | — | `record --json` | VS Code |
| `skraft_status` | — | `status --json` | every host |
| `skraft_report` | — | `report --json` | every host |
| `skraft_journal` | `last?` | `journal show [--last <n>] --json` | every host |
| `skraft_gate` | `all?` | `gate [--all] --json` | every host |
| `skraft_review` | `pr`, `record?` | `review --pr <n> [--record] --json` | VS Code |
| `skraft_workflow_check` | — | `workflow check --json` | every host |
| `skraft_workflow_diff` | — | `workflow diff --json` | every host |
| `skraft_workflow_eject` | `review?` | `workflow eject [review]` | every host |
| `skraft_migrate` | — | `migrate --dry-run --json` | every host |

`skraft_status`, `skraft_report`, `skraft_journal`, `skraft_workflow_check`,
`skraft_workflow_diff` and `skraft_migrate` are marked read-only. Calls run one after the other.
When the host sends a `progressToken`, each line of the command's log reaches it as a
`notifications/progress` while the call runs.

A step of `skraft_start`, `skraft_next`, `skraft_record` or `skraft_review` names in `then` the
tool to call next, with the same `workspace`, for example
`call the skraft_record tool with {}`.

## Which host gets the agent loop <!-- #agent-loop -->

`skraft_start`, `skraft_next`, `skraft_record`, `skraft_review` and the `run` and `review` prompts
conduct the agent loop. The server offers them only to a host that names itself
`Visual Studio Code` or `Visual Studio Code - Insiders` at the handshake (`clientInfo.name`).

| Host at the handshake | Agent loop offered | How a story runs |
| --- | --- | --- |
| `Visual Studio Code`, `Visual Studio Code - Insiders` | yes | the Skraft - Orchestrator agent calls `skraft_start`, then `skraft_next` and `skraft_record` |
| GitHub Copilot CLI | no | the `skraft-pipeline` and `skraft-review` workflows |
| Claude Code | no | `/skraft` and the `run_pipeline` tool of the mod |
| any other name, or none | no | the agent loop through `node "<plugin folder>/engine/drivers/cli/skraft.mjs"` |

A tool or prompt not offered is refused as unknown (`-32602`), and nothing runs. The
instructions the server gives the host at the handshake say the same.

## The folder a tool works in <!-- #workspace -->

1. The `file:` roots the host lists (`roots/list`), when it declared the `roots` capability. The
   server waits 10 seconds for the list.
2. Otherwise, the folder the host started the server in, unless it lies inside the plugin.
3. With several folders, `workspace` names one, by its path or its folder name.

| Refusal | Case |
| --- | --- |
| `no-workspace` | no root, and the server started inside the plugin |
| `several-workspaces` | several roots and no `workspace` |
| `unknown-workspace` | `workspace` names no folder the host shares |
| `closed` | the host closed the connection before the call ran |

Each refusal is a tool error whose text starts with its code; nothing runs.

## Arguments <!-- #arguments -->

Each tool declares a closed input schema. A text argument is non-empty and never starts with
`-`; a number is a positive whole number; `add` is a list of such texts. An argument the tool
does not take, of the wrong kind or missing is refused before anything runs, and the refusal
names the argument, never the value written.

## Prompts <!-- #prompts -->

| Prompt | Arguments | What it asks the model | Offered to |
| --- | --- | --- | --- |
| `init` | — | `skraft_doctor`, then the `skraft-init` skill | every host |
| `run` | `slug` (kebab-case), `issue?` | `skraft_start`, then `skraft_next`, and the loop rules | VS Code |
| `status` | — | `skraft_status` and `skraft_report`, summed up | every host |
| `review` | `pr` | `skraft_review`, and the loop rules | VS Code |

A malformed or missing argument is refused (`-32602`).

## What stays in a terminal <!-- #terminal -->

`skraft decide`, `skraft publish`, `skraft review --publish`, `skraft journal adopt` and
`skraft migrate` without `--dry-run` take a person's yes: they are not tools. A command that asks
for a confirmation gets none through the server, so no tool records a human decision.

## See also <!-- #see-also -->

- [The skraft command line](./cli.md)
- [Setup and maintenance](./cli-maintenance.md)
- [Hosts](./hosts.md)
