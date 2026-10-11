# drivers/claude-mod

Claude Code mod driver. The registered module is `hooks/skraft-mod.tsx` (`hooks/hooks.json` names it alone).
Only that module touches `$`, one line per call, handed to `createClaudeModDriver` as a `ModHost`.
Everything here and everything it imports is free of Node APIs and of `import()`; never imports another driver.

- `claude-mod-driver.mjs`: composition: `/skraft`, the `run_pipeline` tool, the pane snapshot.
- `agent-runner.mjs`: AgentRunner on `$.agent.spawn`, answered by the subagent's `turn.complete`.
- `mod-files.mjs`: FileFunctions on `$.fs`.
- `command-args.mjs`: `/skraft` arguments and the tool input.
- `run-view.mjs`: the Observe view as pane rows and text.

Tests: `tests/skraft-framework/integration/claude-mod/` (Node, scripted `$` functions);
`node tests/skraft-framework/integration/claude-mod/run-plugin-test.mjs` runs `claude plugin test` on a temporary copy of the plugin.
