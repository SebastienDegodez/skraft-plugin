# application/ports

Contracts the use cases depend on (`AgentRunner`, `HumanInteraction`, `PipelineProgress`, stores, clock…),
written as JSDoc typedefs.
Same rule as `application/`: imports only `domain/` and `application/`, no Node, no `$`.
Infrastructure adapters implement them; unit tests replace them with hand-written InMemory doubles.
