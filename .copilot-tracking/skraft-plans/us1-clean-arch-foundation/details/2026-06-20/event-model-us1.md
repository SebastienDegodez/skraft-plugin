<!-- markdownlint-disable-file -->
# Event Model — US1 — Fondation Clean Architecture

US1 is a structural/foundational story — it creates modules and ports, not business flows. No domain events are emitted by the modules themselves. The event model documents the module activation flow for the hook entry point.

```mermaid
timeline
    title Hook Entry Flow — PreToolUse
    section Driver
        HookEntry : Receives raw Claude hook payload
    section Application
        PayloadNormalised : payload.mjs normalises camelCase/PascalCase/snake_case
        DecisionRequested : PreToolUsePort.handle(normalisedPayload)
    section Domain
        SpecificationChecked : Specifications evaluate the payload
    section Response
        DecisionEmitted : allow / deny / block / additionalContext
```

Note: US1 creates the skeleton. Business logic in the specifications is added by subsequent user stories.
