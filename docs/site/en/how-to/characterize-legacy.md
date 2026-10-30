---
layout: doc
lang: en
title: "Put a characterization net on an existing service"
description: "Have brownfield-harness-builder write the contract of an existing HTTP service and characterization tests that pin its current behaviour, then read the PASS, CONCERNS or FAIL verdict before any refactoring."
persona: software-engineer
---
{% assign cites = "/en/reference/citations" | relative_url %}

# Put a characterization net on an existing service

**Goal**: make an existing HTTP service safe to change, with tests that pin what it does today,
bugs included.

To understand the method: [Brownfield journey]({{ "/en/explanation/brownfield" | relative_url }})
and [Feathers, 2004]({{ cites }}#cite-feathers-legacy-2004).

## Prerequisites

- The `skraft` **and** `skraft-brownfield` plugins installed: the second reuses the first's
  `contract-testing` and `mocking-strategy-roster` skills by name
  ([Install skraft on a host]({{ "/en/how-to/install-on-a-host" | relative_url }})).
- A .NET, Java, Python or Node/TypeScript HTTP service that builds, and its test command.
- Recommended: a `skraft-config.json` that describes the component (`skraft init`); its `build`
  and `test` commands and its `mocking` setting then win over detection
  ([Configure components]({{ "/en/how-to/configure-components" | relative_url }})).
- A clean working branch: the agent writes and commits test files.

## 1. Start the agent on the service

| Host | How |
|---|---|
| Claude Code | ask in the conversation: *"Use the skraft-brownfield:brownfield-harness-builder agent to put a characterization net on `services/orders`"* |
| Copilot CLI, VS Code | pick the agent **Skraft - Brownfield Harness Builder** (`/agent` in Copilot CLI, the agent picker in VS Code), then name the service |

Name the component as `skraft-config.json` lists it, or its folder. Without a target, the agent
asks for it.

## 2. Let it establish the contract

The agent first looks for an existing OpenAPI or AsyncAPI document; failing that it generates one
with the framework's tooling (Swashbuckle or NSwag, springdoc, FastAPI, NestJS Swagger); failing
that it reconstructs it from the routes in the code and tags each reconstructed operation
`confidence: Medium` or `Low`. The contract is committed under the component's test paths.

If the repository already holds a contract elsewhere, give its path at step 1.

## 3. Let it write the characterization tests

One test per contract operation and response family, through the framework's in-process test
host, every downstream dependency mocked as the component's `mocking` setting says (Microcks or
in-process). A behaviour that looks wrong is asserted as it is, with the comment:

```text
CHARACTERIZATION: current behaviour may be unintended — <what and why>
```

The agent never touches the service's code, even to make a test pass.

## 4. Read the verdict

The agent runs the component's `test` command against the **unmodified** code and returns:

| Verdict | Meaning | Action |
|---|---|---|
| `PASS` | all green and every contract operation has its test | go on to refactoring |
| `CONCERNS` | all green, with named gaps (a low-confidence operation, a dependency that could not be mocked cleanly) | for each gap, strengthen the net or accept the risk, and tell the agent |
| `FAIL` | a test fails against unmodified code, or no contract could be established | the harness is wrong: have it fixed, never the service |

The final report gives the contract's origin and path, the test command run and its result, the
verdict, the gaps and the suspected bugs.

## 5. Commit the net

Read the tests marked `CHARACTERIZATION:`: each documents a possible bug. Keep them as they are
until a story changes that behaviour on purpose. The net stays in the test suite and runs with the
gates of every skraft run.

## Troubleshooting

| Situation | Action |
|---|---|
| `[SKILL MISSING] contract-testing` (or `mocking-strategy-roster`) | Install the `skraft` plugin next to `skraft-brownfield`, then run again. |
| `{"status": "blocked", "summary": …}` | The agent ran with nobody to answer: run it again in an interactive session, or provide what `summary` names. |
| A downstream dependency cannot be mocked | Verdict `CONCERNS`: accept the gap, or change the component's `mocking` ([Configure components]({{ "/en/how-to/configure-components" | relative_url }})). |
| No contract-testing skill for the stack | The agent uses the framework's standard test host and says so in its report. |

## See also

- [Refactor existing code under a net]({{ "/en/how-to/refactor-legacy" | relative_url }}) — the next step.
- [Brownfield journey]({{ "/en/explanation/brownfield" | relative_url }})
- [The agent and skill catalogue]({{ "/en/dashboard/" | relative_url }}#agent-brownfield-harness-builder)
