# drivers/copilot-workflow

Copilot CLI dynamic workflow driver: launches agents with `ctx.agent`, asks with `ctx.pause`.
Imports use cases, ports and infrastructure; never another driver.
Tested in integration against a fake `ctx` (agent, pause, resume journal).
