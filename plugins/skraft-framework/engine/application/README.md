# application

Use cases (`RunPipeline`, `Decide`, `ClosePhase`, `Observe`…) that orchestrate the domain through ports.
`run-pipeline.mjs` runs each workflow node by kind: agent, gate, review; `review-runs.mjs` runs a review step
(its lenses through `AgentRunner.runMany`, the refuter on blocker and high findings, then the domain verdict).
Imports only `domain/` and `application/`.
No `node:` import, no `process`, no `child_process`, no `$`: drivers and adapters bring I/O in through `ports/`.
