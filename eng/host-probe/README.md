# eng/host-probe

Measures the GitHub Copilot host behaviours the `skraft-pipeline` driver relies on
([ADR-002](../../docs/adr/adr-002-copilot-host-driver-contract.md)). It drives a headless Copilot SDK
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
| `--agent-calls` | off | run the two refusal checks, each of which starts one agent through `ctx.agent` (may spend AI credits) |

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
| `throwing-workflow` | #247 | what the host returns for a workflow that throws |
| `broken-workflow-isolation` | #246 | a workflow without `phases` takes the tool of the same join down |
| `bad-tool-name-isolation` | #246 | a refused tool name takes the workflow of the same join down |
| `skraft-extension-loaded` | opens one on failure | `skraft_decide` is offered |
| `skraft-workflow-registered` | opens one on failure | `skraft-pipeline` runs and refuses an invalid slug |
| `unknown-arg-ignored` | #249 | an unknown workflow argument is silently ignored |
| `decide-without-confirm` | #244 | `skraft_decide` ratifies a pending ADR without asking the host |
| `decide-after-cd` | #245 | `skraft_decide` still acts on the first repository after `/cd` |
| `session-agents` | opens one on failure | every `com.github.copilot/agents/*` resolves in `session.rpc.agent.list` |
| `copilot-models-available` | opens one on failure | every Copilot name under `models` in the `skraft-config.json` of the directory the probe runs from is in `client.listModels()`; inconclusive when it names none |
| `skraft-tool-names-free` | opens one on failure | the tool names of a session with no plugin (the host's own tools, listed in the report) include no tool the `skraft-pipeline` extension registers |
| `copilot-model-refusal` | opens one on failure | with `--agent-calls`: what `ctx.agent` answers for an unknown model; passes when the host accepts it or `refusalOf` reads the error as `model`; the error text is in the report |
| `copilot-effort-refusal` | opens one on failure | with `--agent-calls`: what `ctx.agent` answers for `reasoningEffort: 'max'` on the first listed model whose name has no `claude`; passes when the host accepts it or `refusalOf` reads the error as `effort` |

A check linked to an issue states the issue's premise: `pass` means the premise was measured as
the issue says. Paste the Markdown report into `docs/v2/host-verification.md`.

Tests: `tests/tooling/host-probe/` runs the probe against a simulated SDK.

CI: `.github/workflows/copilot-host-smoke.yml` runs the probe on the pinned CLI with no login and no
secret, and requires only the checks that hold without a login; the host refuses every workflow
run there.
