# drivers/copilot-workflow

Copilot CLI dynamic workflow driver `skraft-pipeline`: composes Init and RunPipeline with the Node adapters; decides nothing.
Imports use cases, ports and infrastructure; never another driver.

- `skraft-pipeline-workflow.mjs`: `SKRAFT_PIPELINE_META` and the workflow body (slug → Init then RunPipeline; no slug → the active pipeline).
- `ctx-agent-runner.mjs`: AgentRunner on `ctx.agent`; resolves the session agent id (`agentIds` arg, session list, else `<plugin>:<id>` for a plugin agent and the bare id for a repository one); `runMany` calls `ctx.agent` for the whole batch at once, Copilot bounding it by `maxConcurrentSubagents`.
- `ctx-progress.mjs`: PipelineProgress on `ctx.log`.
- `skraft-decide-tool.mjs`: the `skraft_decide` tool; no step asks a question yet.

The SDK entry is `com.github.copilot/extensions/skraft-pipeline/extension.mjs`.
Tested in integration against a simulated `ctx` (`tests/skraft-framework/integration/copilot-workflow/`).
