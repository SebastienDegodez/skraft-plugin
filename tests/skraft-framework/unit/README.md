# Engine unit tests

Application acceptance tests: each test enters through a use case of `plugins/skraft-framework/engine/application/`
and asserts on what it returns or what it wrote through its ports.

- One folder per feature (`pipeline-flow/`, `gates/`, `decisions/`…), never per ticket.
- Ports are replaced by hand-written InMemory doubles (`InMemoryRunStore`, `ScriptedCommandRunner`, `FixedClock`…); domain objects are real; no mock library.
- A domain test only for a complex rule already extracted and covered here.
- Empty until the first use case exists: none is invented to fill it.
