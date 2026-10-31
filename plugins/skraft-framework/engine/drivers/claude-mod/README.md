# drivers/claude-mod

Claude Code mod driver. The registered module is `hooks/skraft-mod.tsx` (`hooks/hooks.json` names it alone).
Only that module touches `$`, one line per call, handed to `createClaudeModDriver` as a `ModHost`.
Everything here and everything it imports is free of Node APIs and of `import()`; never imports another driver.

- `claude-mod-driver.mjs`: composition: `/skraft`, the `run_pipeline` tool, the pane snapshot, the pane's answer buttons (`answer`: a press goes through Decide with the provenance `host`, a refusal asks its reason in the dialog first, then the run resumes).
- `mod-home.mjs`: the home folder, the one a Node host of the machine reads: node's `os.homedir()` first (`lock-file-command.mjs home`), else `$.env.get('HOME')`, else `USERPROFILE`. `~/.skraft/config.json` and the journal keys live there; with no home folder, that configuration layer is absent and no new journal starts.
- `mod-run-lock.mjs`: the leases of the pipeline and of the pull request reviews and the journal keys, written by `node lock-file-command.mjs` (`create`, `replace`, `renew`, `remove`, `make-key`), within 20 s: `$.fs` has no exclusive create, rename, remove or file mode; and the review folder's checks (`contained`, `same-as`, its names in a file of the review folder that node removes): `$.fs` cannot tell a link from a folder, nor which file a name opens.
- `dialog-human.mjs`: HumanInteraction on `$.ui.ask`; a refusal asks its reason next (`refusalReason`, also asked for a refusal pressed in the pane); a dismissed dialog is no answer.
- `agent-runner.mjs`: AgentRunner on `$.agent.spawn` (`<plugin>:<id>` for a plugin agent, the bare id for a repository one), answered by the subagent's `turn.complete`; `runMany` spawns a batch before waiting for any, and reports the batch's session cost, not each agent's. The first Claude Code model the configuration gives the dispatch's family goes to the spawn as `model`; with none, no `model` is passed and the agent file's own model decides. The dispatch's Claude Code effort is **not** passed to the spawn (`$.agent.spawn` takes no `effort`; Claude Code 2.1.291 and 2.1.314 drop the field, see docs/v2/host-verification.md, #258): the runner keeps it by agentId from the spawn's answer to the subagent's turn, and the module's `turn.step` hook (`driver.stepEffort`) sets it on each of that subagent's model requests; with none assigned, the agent file's own effort applies. `skraft doctor` shows the effort assigned. The answer names the model the spawn reports, else the one asked.
- `mod-files.mjs`: FileFunctions on `$.fs`, listing a folder through Git on `$.process.run`.
- `mod-processes.mjs`: CommandRunner on `$.process.run` (Git, gates, replayed test commits).
- `command-args.mjs`: `/skraft` arguments and the tool input.
- `run-view.mjs`: the Observe view as pane rows (each phase followed by its steps of the workflow graph) and text (without the steps), and the answer buttons of the waiting question.

Tests: `tests/skraft-framework/integration/claude-mod/` (Node, scripted `$` functions);
`node tests/skraft-framework/integration/claude-mod/run-plugin-test.mjs` runs `claude plugin test` on a temporary copy of the plugin.
