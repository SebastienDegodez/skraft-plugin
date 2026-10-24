# drivers/copilot-sdk

VS Code driver through the Copilot SDK, run from a VS Code terminal or task:

```text
node "<plugin folder>/engine/drivers/copilot-sdk/skraft-run.mjs" [<slug>] [--issue <number>] [--title <text>] [--base <ref>] [--from-artifacts] [--allow-all-tools]
```

It starts the Copilot CLI headless through the SDK, opens a session in the working copy with the
skraft plugin (`pluginDirectories`, `requestExtensions`), runs the `skraft-pipeline` workflow the
plugin's extension registers, and follows it to its end. The engine and the Copilot workflow
driver do the rest inside the CLI; this driver imports neither the workflow driver nor a use case.
Imports infrastructure and its own modules; never another driver.

- `skraft-run.mjs`: the entry, the one file that loads the SDK. It finds it with
  `infrastructure/copilot/copilot-sdk-locator.mjs` (the newest `~/.copilot/pkg/<platform>/<version>/`
  that ships `copilot-sdk/index.js` and the CLI entry `index.js`), sets `COPILOT_CLI_PATH` to that
  CLI entry unless it is set, and asks the person in the terminal (`terminalAsk`). Nothing starts
  when it is imported.
- `skraft-run-command.mjs`: the command line, the outcome line, the exit code (0 done or waiting,
  1 otherwise, 2 usage).
- `sdk-pipeline-run.mjs`: the session path the host probe measures (`rpc.workflow.run`, asked
  again until the extension has registered the workflow, then `rpc.workflow.getRun` until a
  terminal status). Every failure is an outcome with a fixed reason; no SDK or host text is passed
  on. A `paused` run waits on a question: `skraft decide`, then `skraft-run` again. Each permission
  an agent asks for is put to the person (`y` approves it once); `--allow-all-tools` approves every
  one; with no terminal, a permission is rejected.

`skraft doctor` says whether this driver or the agent loop (`drivers/cli/`, `skraft next` /
`skraft record`) runs under VS Code. What the driver assumes of the host and has not measured is
listed in `docs/v2/host-verification.md`.
Tested in integration against a simulated SDK (`tests/skraft-framework/integration/copilot-sdk/`).
