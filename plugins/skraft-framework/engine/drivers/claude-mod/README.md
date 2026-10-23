# drivers/claude-mod

Claude Code mod driver. The registered module is `hooks/skraft-mod.tsx` (`hooks/hooks.json` names it alone).
Only that module touches `$`, one line per call, handed to `createClaudeModDriver` as a `ModHost`.
Everything here and everything it imports is free of Node APIs and of `import()`; never imports another driver.

- `claude-mod-driver.mjs`: composition: `/skraft`, the `run_pipeline` tool, the pane snapshot. `~/.skraft/config.json` is read from the home folder `$.env.get('HOME')`, else `USERPROFILE`, names; with neither set, that layer is absent.
- `dialog-human.mjs`: HumanInteraction on `$.ui.ask`; a refusal asks its reason next; a dismissed dialog is no answer.
- `agent-runner.mjs`: AgentRunner on `$.agent.spawn` (`<plugin>:<id>` for a plugin agent, the bare id for a repository one), answered by the subagent's `turn.complete`; `runMany` spawns a batch before waiting for any, and reports the batch's session cost, not each agent's. The first Claude Code model the configuration gives the dispatch's family goes to the spawn as `model`; with none, no `model` is passed and the agent file's own model decides. The dispatch's Claude Code effort is **not** passed: `$.agent.spawn` takes `prompt`, `description`, `subagentType`, `model`, `name`, `cwd` and no `effort` (Claude Code 2.1.305 mod API), and nothing in the repository shows the host ignoring an unknown field, so the agent file's own effort applies; `skraft doctor` still shows the effort assigned. The answer names the model the spawn reports, else the one asked.
- `mod-files.mjs`: FileFunctions on `$.fs`, listing a folder through Git on `$.process.run`.
- `mod-processes.mjs`: CommandRunner on `$.process.run` (Git, gates, replayed test commits).
- `command-args.mjs`: `/skraft` arguments and the tool input.
- `run-view.mjs`: the Observe view as pane rows and text.

Tests: `tests/skraft-framework/integration/claude-mod/` (Node, scripted `$` functions);
`node tests/skraft-framework/integration/claude-mod/run-plugin-test.mjs` runs `claude plugin test` on a temporary copy of the plugin.
