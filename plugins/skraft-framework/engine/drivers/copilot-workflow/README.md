# drivers/copilot-workflow

Copilot CLI dynamic workflow driver `skraft-pipeline`: composes Init and RunPipeline with the Node adapters; decides nothing.
Imports use cases, ports and infrastructure; never another driver.

- `skraft-pipeline-workflow.mjs`: `SKRAFT_PIPELINE_META` and the workflow body (slug → Init then RunPipeline; no slug → the active pipeline).
- `ctx-agent-runner.mjs`: AgentRunner on `ctx.agent`; resolves the session agent id (`agentIds` arg, session list, else `<plugin>:<id>` for a plugin agent and the bare id for a repository one); `runMany` calls `ctx.agent` for the whole batch at once, Copilot bounding it by `maxConcurrentSubagents`. A dispatch carries the Copilot model names `skraft-config.json` gives its family (`models.<family>.copilot`, the preferred first); the first is passed in the `model` option, and with none the agent runs on the session's model. No model name is written in code and no workflow argument chooses one; while Copilot rejects the model the next name is tried (label suffixed ` · <name>`), then the session's model (` · session model`). The answer names the model it ran on, null for the session's.
- `ctx-progress.mjs`: PipelineProgress on `ctx.log`.
- `ctx-human.mjs`: HumanInteraction: the question in the log, then `ctx.pause(key)`; a resumed run whose question is still open gets no answer and waits.
- `skraft-decide-tool.mjs`: the `skraft_decide` tool, through Decide (`key`, `answer`, `reason` for a refusal).

The SDK entry is `com.github.copilot/extensions/skraft-pipeline/extension.mjs`.
Tested in integration against a simulated `ctx` (`tests/skraft-framework/integration/copilot-workflow/`).
