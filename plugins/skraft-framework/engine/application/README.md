# application

Use cases (`RunPipeline`, `Decide`, `ClosePhase`, `Observe`…) that orchestrate the domain through ports.
Imports only `domain/` and `application/`.
No `node:` import, no `process`, no `child_process`, no `$`: drivers and adapters bring I/O in through `ports/`.
