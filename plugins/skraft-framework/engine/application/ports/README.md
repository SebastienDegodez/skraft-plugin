# application/ports

Contracts the use cases depend on (`AgentRunner`, `HumanInteraction`, `PipelineProgress`, stores, clock…),
written as JSDoc typedefs.
A review step uses `AgentRunner.runMany` (its lenses together, in parallel where the host can) and
`SourceControl.diff` / `changedFiles` (what changed since the base of the run).
Same rule as `application/`: imports only `domain/` and `application/`, no Node, no `$`.
Infrastructure adapters implement them; unit tests replace them with hand-written InMemory doubles.
