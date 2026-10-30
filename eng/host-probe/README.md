# eng/host-probe

Measures the GitHub Copilot host behaviours the `skraft-pipeline` driver relies on
([the Copilot driver contract](../../docs/site/en/explanation/architecture.md#the-copilot-driver-contract)). It drives a headless Copilot SDK
host: **no model call, no AI credit** unless `--agent-calls` is given. The skraft workflow is
only started with an invalid slug, which the engine refuses before any agent.

## Run it

Prerequisites: Node ≥ 22, the Copilot CLI installed and signed in (`copilot --version`), `gh` signed
in for `--report-issues`.

```bash
git fetch origin && git switch v2/copilot-host-rules      # or integration/v2-next once merged
npm run probe:copilot                                     # report only
npm run probe:copilot -- --report-issues --dry-run        # show what would go to GitHub
npm run probe:copilot -- --report-issues                  # comment / open issues
```

On Windows use the same commands from PowerShell. Options:

| Option | Default | Use |
| --- | --- | --- |
| `--sdk <dir>` | newest `~/.copilot/pkg/<platform>/<version>/copilot-sdk`, then `node_modules/@github/copilot/copilot-sdk` | the SDK to drive the host with (a folder with `index.js`) |
| `--copilot <path>` | `COPILOT_CLI_PATH`, else the CLI `index.js` next to the chosen SDK (`<version>/index.js`) | the Copilot CLI to measure; the bare `copilot-runtime` cannot launch extensions |
| `--out <dir>` | `host-probe-results` | where the JSON and Markdown reports go |
| `--report-issues` | off | comment each conclusive result on its linked issue; open an issue for a failed requirement no open issue covers |
| `--dry-run` | off | with `--report-issues`, print the GitHub actions and do nothing |
| `--keep` | off | keep the temporary fixtures |
| `--require <id,...>` | none | exit 1 when one of these checks does not pass or is not in the report (the CI smoke) |
| `--agent-calls` | off | run the checks that start agents through `ctx.agent` (may spend AI credits): the two refusal checks (one agent each) and `agent-skills-preload` (two agents) |

The session asks for extension access once: the probe approves it for its own fixtures and for
`plugins/skraft-framework`.

## Checks

| Check | Issue | Measures |
| --- | --- | --- |
| `extension-loads-agent-plugins` | opens one on failure | an extension under `com.github.copilot/extensions/` with a root Agent Plugins manifest loads |
| `extension-loads-claude-plugin` | — | an extension under `extensions/` with `.claude-plugin/plugin.json` loads |
| `cwd-after-cd` | #245 | `process.cwd()` after `setWorkingDirectory`, and `session.context_changed` |
| `snapshot-working-directory` | opens one on failure | `session.rpc.metadata.snapshot().workingDirectory` names the session's directory at join and after `setWorkingDirectory` (the driver seeds its directory tracker from it) |
| `confirm-from-tool` | #244 | `session.ui.confirm` from a tool reaches the host's handler |
| `confirm-in-autopilot` | #244 | whether the host still relays `confirm` in `autopilot` |
| `confirm-from-workflow` | #244 | `ctx.session.ui.confirm` inside a workflow run |
| `confirm-joined-session-from-workflow` | opens one on failure | the joined session's `session.ui.confirm` and `rpc.mode.get` inside a workflow run, as the `skraft-review` consent calls them |
| `select-joined-session-from-workflow` | opens one on failure | the joined session's `session.ui.select` inside a workflow run reaches the host's handler with the options, and returns the chosen one (`null` when declined): how the `skraft-pipeline` run asks a question with options |
| `input-joined-session-from-workflow` | opens one on failure | the joined session's `session.ui.input` inside a workflow run reaches the host's handler as a text field, and returns the text (`null` when declined): how the run asks a blocked step's instruction and a refusal's reason |
| `throwing-workflow` | #247 | what the host returns for a workflow that throws |
| `workflow-undeclared-phase` | — | `ctx.phase` of a title `meta.phases` does not declare does not throw, the run completes, and `getRunDetail` lists the phase entered with a null ordinal (a phase only an ejected workflow names, #429); a measurement |
| `broken-workflow-isolation` | #246 | a workflow without `phases` takes the tool of the same join down |
| `bad-tool-name-isolation` | #246 | a refused tool name takes the workflow of the same join down |
| `canvas-accepted-at-join` | opens one on failure | a join carrying a canvas (`createCanvas`) and a tool is accepted: `session.rpc.canvas.list()` names the canvas and the tool is offered |
| `canvas-open-headless` | opens one on failure | `session.rpc.canvas.open` of a headless SDK session calls the extension's `open`, whose loopback page answers 200; opening the same instance again calls `open` again; reports `host.capabilities.canvases` and the directory the open request carries |
| `canvas-action-invoke` | — | `session.rpc.canvas.action.invoke` reaches the action's handler and returns its result |
| `confirm-from-canvas` | — | a POST to the canvas page's loopback server, outside any tool call, makes the joined session's `session.ui.confirm` reach the host's handler (no skraft path uses it: the `skraft-pipeline` canvas takes no answer) |
| `canvas-close` | — | `session.rpc.canvas.close` calls the extension's `onClose` |
| `canvas-open-from-extension` | — | from a tool call, the extension's joined session opens its own canvas with `session.rpc.canvas.open`: the host calls the extension's `open` with the input given (`{ tab: 'configuration' }`), checked against the canvas's `inputSchema` |
| `canvas-reopen-other-tab` | — | reopening an open instance with another input calls the extension's open with that input; reports the url the host returns and keeps (listOpen) and its session.canvas.opened events |
| `canvas-agent-tools` | — | the model gets no canvas tool without `requestCanvasRenderer`, and `list_canvas_capabilities`, `open_canvas`, `invoke_canvas_action` with it |
| `mcp-tool-from-workflow` | #400 | inside a workflow run (after waiting, at most 15 s, until no probe server is `pending`; still pending, every MCP check is inconclusive), the extension's joined session lists the session's MCP servers (`rpc.mcp.list`) and a server's tools (`rpc.mcp.listTools`), calls a tool with `rpc.tools.execute({ name: '<server>-<tool>' })` and reads its result, with no model call; the session runs a dependency-free stdio MCP server the probe writes |
| `mcp-permission-from-workflow` | #400 | an MCP tool without `readOnlyHint` called that way reaches the host's permission handler (`kind: 'mcp'`); approved it runs, rejected it returns `resultType: 'rejected'`; a read-only tool asks nothing |
| `mcp-unavailable-from-workflow` | #400 | what the extension gets for a server not configured (`listTools` throws "not connected"), a server whose process exits (listed `failed`) and a tool that does not exist (`resultType: 'failure'`) |
| `mcp-tool-error-from-workflow` | #400 | an MCP tool that answers `isError: true` comes back from `rpc.tools.execute` as `resultType: 'failure'` with its text |
| `github-mcp-in-session` | #400 | `github-mcp-server` (Copilot's built-in GitHub MCP server, or the developer's of that name) is listed connected with tools; inconclusive otherwise, never failed: it hangs on the login and the machine's configuration |
| `skraft-extension-loaded` | opens one on failure | `skraft_decide` is offered |
| `skraft-workflow-registered` | opens one on failure | `skraft-pipeline` runs and refuses an invalid slug |
| `unknown-arg-ignored` | #249 | an unknown workflow argument is silently ignored |
| `decide-without-confirm` | #244 | `skraft_decide`, called with no argument, ratifies a pending ADR without asking the host |
| `skraft-canvas-registered` | opens one on failure | the `skraft-pipeline` canvas is declared in the session (`session.rpc.canvas.list()`) |
| `skraft-canvas-opens` | opens one on failure | `session.rpc.canvas.open` of `skraft-pipeline`, in a working copy whose pipeline waits on `adr-0`, gives a loopback url and the slug's title; the page answers 200 under `default-src 'none'` and its event stream, opened with the page's token, carries `adr-0` |
| `skraft-canvas-read-only` | — | the canvas takes no answer: a POST `/answer` with the page's token and Origin answers 404, nothing is asked of the host nor journaled |
| `skraft-decide-one-question` | opens one on failure | `skraft_decide`, with no argument, puts the question the active pipeline waits on to the host once, as a choice among its options; the option chosen is journaled `host-confirmed`, with no confirmation after it |
| `decide-after-cd` | #245 | `skraft_decide` still acts on the first repository after `/cd` |
| `session-agents` | opens one on failure | every `com.github.copilot/agents/*` resolves in `session.rpc.agent.list` |
| `copilot-models-available` | opens one on failure | every Copilot name under `models` in the `skraft-config.json` of the directory the probe runs from is in `client.listModels()`; inconclusive when it names none |
| `skraft-tool-names-free` | opens one on failure | the tool names of a session with no plugin (the host's own tools, listed in the report) include no tool the `skraft-pipeline` extension registers |
| `plugin-command-listed` | opens one on failure | `session.rpc.commands.list({ includeSkills: true })` lists, once each, the commands a plugin ships under `com.github.copilot/commands/`; reports each `name`, `aliases`, `kind` and `input.hint` (a command named like its plugin and one that is not, which shows the prefix rule) |
| `plugin-command-input` | — | `session.rpc.commands.invoke({ name, input })` returns an `agent-prompt`; reports whether the typed text is appended, substituted for `$ARGUMENTS` or absent (a measurement) |
| `skraft-command-listed` | opens one on failure | with the real `plugins/skraft-framework` and `plugins/skraft-backlog`, `skraft` and `skraft-refine` are listed once each, no name masking another; reports the exposed names, how the input of the real `skraft` command lands, and the `rpc.skills.list()` entries |
| `plugin-command-not-model-invoked` | — | needs `--agent-calls` (one message to the model) and is not written yet: always `inconclusive` |
| `copilot-model-refusal` | opens one on failure | with `--agent-calls`: what `ctx.agent` answers for an unknown model; passes when the host accepts it or `refusalOf` reads the error as `model`; the error text is in the report |
| `copilot-effort-refusal` | opens one on failure | with `--agent-calls`: what `ctx.agent` answers for `reasoningEffort: 'max'` on the first listed model whose name has no `claude`; passes when the host accepts it or `refusalOf` reads the error as `effort` |
| `agent-skills-preload` | — | with `--agent-calls`: an Agent Plugins fixture holds a skill with a token, an agent that lists it under `skills:` and a twin without; each is asked, with no tool, for the token. `pass` when only the first knows it (Copilot preloads the field), `fail` when neither does, `inconclusive` when the twin knows it too or an agent is not listed |

A check linked to an issue states the issue's premise: `pass` means the premise was measured as
the issue says. Paste the Markdown report into `docs/v2/host-verification.md`.

Tests: `tests/tooling/host-probe/` runs the probe against a simulated SDK.

Claude Code: `node eng/host-probe/claude-mod-mcp-trial.mjs [--claude <claude binary>] [--keep]` is a
trial, not a check (#400, #422). It runs `claude -p` three times on a throwaway mod whose `prompt.submit` hook
calls `$.mcp.call` on the probe's MCP server, writes what it got and drops the prompt, so no turn
starts (the model it names does not exist); once with the read-only probe tools granted
(`--allowedTools`), once with nothing granted, once with the server granted by `permissions.allow` in
the project's `.claude/settings.json`. It prints what each call gave and the raw shape of the entries
`$.tool.list()` returns.

CI: `.github/workflows/copilot-host-smoke.yml` runs the probe on the pinned CLI with no login and no
secret, and requires only the checks that hold without a login; the host refuses every workflow
run there.
