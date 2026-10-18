# drivers/claude-mod

Claude Code mod driver. The registered module is `hooks/skraft-mod.tsx` (`hooks/hooks.json` names it alone).
Only that module touches `$`, one line per call, handed to `createClaudeModDriver` as a `ModHost`.
Everything here and everything it imports is free of Node APIs and of `import()`; never imports another driver.

- `claude-mod-driver.mjs`: composition: `/skraft`, the `run_pipeline` tool, the pane snapshot.
- `dialog-human.mjs`: HumanInteraction on `$.ui.ask`; a refusal asks its reason next; a dismissed dialog is no answer.
- `agent-runner.mjs`: AgentRunner on `$.agent.spawn` (`<plugin>:<id>` for a plugin agent, the bare id for a repository one), answered by the subagent's `turn.complete`; `runMany` spawns a batch before waiting for any, and reports the batch's session cost, not each agent's. A dispatch's model family goes to the spawn as `model`; the answer names the model the spawn reports, else the family.
- `mod-files.mjs`: FileFunctions on `$.fs`, listing a folder through Git on `$.process.run`.
- `mod-processes.mjs`: CommandRunner on `$.process.run` (Git, gates, replayed test commits).
- `command-args.mjs`: `/skraft` arguments and the tool input.
- `run-view.mjs`: the Observe view as pane rows and text.

Tests: `tests/skraft-framework/integration/claude-mod/` (Node, scripted `$` functions);
`node tests/skraft-framework/integration/claude-mod/run-plugin-test.mjs` runs `claude plugin test` on a temporary copy of the plugin.
