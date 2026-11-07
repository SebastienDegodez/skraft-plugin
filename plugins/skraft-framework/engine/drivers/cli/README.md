# drivers/cli

`skraft.mjs` is the composition root of the command line: it reads `process`, wires adapters and sets the exit code.
`run-cli.mjs` holds the argument dispatch and receives its services and console as parameters.
Never imports another driver.

| Command | Use case | Exit |
| --- | --- | --- |
| `skraft init [--add <folder>]...` | ConfigureComponents: one component per project into `skraft-config.json` | 0, 1 invalid config |
| `skraft init <slug> [--issue <n>] [--title <t>] [--base <ref>] [--from-artifacts]` | Init: active pipeline, journal, bases, the issue of `--issue` read through gh for every agent (when it cannot be read, the run starts on its number and title and says so); from the DISCUSS stories, starts in DESIGN | 0, 1 refused |
| `skraft status [--json]` | Observe; a run that waits shows its question and how to answer it | 0, 1 tampered |
| `skraft report [--json]` | Observe.report: time, cost and retries of each step | 0, 1 tampered |
| `skraft decide [<key>] <answer> [--reason <text>]` | Decide, once the person confirms the answer at an interactive prompt (journaled `by: 'cli-tty'`); without a TTY, refused | 0, 1 refused or not confirmed |
| `skraft publish` | Publish: pushes the branch and opens or updates the pull request of the completed run; typed by the developer, it consents for that publication | 0 open, 1 otherwise |
| `skraft next [--json]` | RunPipeline through the agent loop, on Copilot's agents: runs until the run needs agents or a human; refused while handed over agents are not recorded | 0 dispatch, waiting or done; 1 blocked or refused |
| `skraft record [--json]` | Hands the saved replies of the handed over agents to the run, then runs on as `next` does | as `next` |
| `skraft gate [--all] [--json]` | RunGate: touched components, or all | 0 passed, 1 otherwise |
| `skraft doctor [--run] [--base <ref>] [--json]` | Doctor | 0 every check ok, 1 otherwise |
| `skraft commands --json` | Not a use case: every usage line as data, from the same table as the dispatch and the usage (read by the `skraft` command of `@skraft/cli`) | 0, 2 malformed |
| `skraft review --pr <n> [--publish] [--record] [--json]` | ReviewPullRequest through the agent loop: hands the lenses, then the refuter, over; `--record` hands their replies back; `--publish` keeps the verdict in one comment of the pull request once the consent is given at the terminal | 0 approved or dispatch, 1 otherwise |
| `skraft journal show [--last <n>] [--json]` | Not a use case: the state of the active pipeline's hash chain, then its last entries (20 without `--last`) | 0, 1 chain broken or unverifiable |
| `skraft mcp` | Not a use case: serves the commands below as MCP tools over stdin and stdout (see below) | 0 when the host closes stdin |

A malformed command line prints the usage and exits 2.

## Agent loop (VS Code without the Copilot SDK)

`agent-loop.mjs` and `loop-agent-runner.mjs`: the fallback driver an agent conducts. `next` runs
RunPipeline with an AgentRunner that, for dispatches it has no reply for, writes each brief and
an empty reply file under `<slug>/results/loop/`, lists them in `pending.json`, and stops the run
(`HandedOver`); the step it prints names each agent, its Copilot model, the prompt to start it
with, its reply file and the `record` command, with the absolute path of `skraft.mjs`. `record`
reads the reply files into `replies.json` and runs on (each brief ends with a one-time token the
reply must carry, which proves the brief was read, not which agent read it; a loop file skraft
did not write refuses with `loop-file-unreadable`): a dispatch asked again since the last
`next` gets its recorded reply, as a Copilot workflow run answers a call it already made. A
question makes the run wait; the human answers with `skraft decide`, then the agent runs `next`.
Lenses run one after the other. The journal is the one the Copilot workflow writes, without the
models and costs the loop cannot know.

## MCP server (`skraft mcp`)

`mcp-server.mjs`, `mcp-tools.mjs`, `mcp-prompts.mjs`, `mcp-roots.mjs`: a transport of this driver,
not another driver. JSON-RPC 2.0 over stdio, one message per line, no dependency; stdout carries
only the protocol, the log goes to stderr. The host starts it from the plugin's `mcp.json`
(Agent Plugins) or the `mcpServers` of `.claude-plugin/plugin.json` (Claude Code).

Each tool builds an argv and calls `runCli` with a console that captures its lines: a tool runs
the same code as the command. Calls run one after the other; stderr lines become
`notifications/progress` when the call carries a `progressToken`.

| Tool | Command | Annotations |
| --- | --- | --- |
| `skraft_doctor {run?, base?}` | `doctor [--run] [--base <ref>] --json` | idempotent |
| `skraft_init {add?}` | `init [--add <folder>]...` | |
| `skraft_start {slug, issue?, title?, base?, fromArtifacts?}` | `init <slug> ...` | |
| `skraft_next` / `skraft_record` | `next --json` / `record --json` | |
| `skraft_status` / `skraft_report` | `status --json` / `report --json` | read-only |
| `skraft_journal {last?}` | `journal show [--last <n>] --json` | read-only |
| `skraft_gate {all?}` | `gate [--all] --json` | |
| `skraft_review {pr, record?}` | `review --pr <n> [--record] --json` | open world |
| `skraft_workflow_check` / `skraft_workflow_diff` | `workflow check --json` / `workflow diff --json` | read-only |
| `skraft_workflow_eject {review?}` | `workflow eject [review]` | |
| `skraft_migrate` | `migrate --dry-run --json` | read-only |

The agent loop (`skraft_start`, `skraft_next`, `skraft_record`, `skraft_review` and the `run` and
`review` prompts) is offered only to a host that names itself `Visual Studio Code` or
`Visual Studio Code - Insiders` at `initialize`: Copilot CLI and Claude Code run the pipeline and
the review themselves, and an unknown host or one that gives no name falls back to the `node`
loop. Hidden, such a tool or prompt is refused as unknown (-32602). Its description keeps it for
the Skraft - Orchestrator agent.

Every tool also takes `workspace`. The folder a tool runs in is a `file:` root the host lists
(`roots/list`), else the directory the server started in when it lies outside the plugin; with
several roots, `workspace` names one by path or folder name. No folder, several without
`workspace`, or an unknown one: the call is refused and nothing runs. Unknown arguments are
refused without echoing the value. A step's `then` names the next tool, not a command.

What takes a person stays a command typed in a terminal: `decide`, `publish`,
`review --publish`, `journal adopt`, `migrate` without `--dry-run`. The server answers
`confirm` with `null`, so no tool records a human decision.

Prompts: `init`, `run {slug, issue?}`, `status`, `review {pr}`; how a host names them is not measured yet.
