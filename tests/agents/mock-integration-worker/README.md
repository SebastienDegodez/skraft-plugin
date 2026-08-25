# mock-integration-worker — agent suite (DISABLED)

Migrated from the GENESIS evals removed by `97705d8` *feat(evals): adopt vally evaluation
pipeline*:

| GENESIS source | Landed as |
|---|---|
| `evals/mock-integration-worker/content.yml` — 3 fixtures | [`eval.yaml`](eval.yaml) — 3 stimuli |
| `evals/mock-integration-worker/triggers.yml` — 20 triggers | [`triggers.yml`](triggers.yml) — preserved, not executed |

Same translation rules as the sibling
[`contract-testing-worker`](../contract-testing-worker/README.md) suite: `expected_output` and
`forbidden` became deterministic graders, `seed_context` became a staged workspace, `value_delta`
was dropped because an agent suite is single-arm, and the trigger corpus was not translated.

## What the three stimuli actually pin down

The whole worker is an override cascade, so each stimulus fixes one rung of it and the graders
check both what should happen and what the rung below it would have produced:

| Stimulus | Cascade rung | The failure it catches |
|---|---|---|
| `microcks-default` | built-in default | Hand-rolling an `HttpMessageHandler` instead of resolving the contract-seeded container |
| `inprocess-instruction-file` | `skraft.instructions.md` | Ignoring the repo override, or picking Moq when no library was named |
| `prompt-override-moq` | the run prompt | Keeping the default despite an explicit request, or substituting the preferred library for the requested one |

All three in-process libraries are declared in the fixture's `Directory.Packages.props` on
purpose: a stimulus that names Moq must fail because the worker ignored the override, never
because the package was absent.

## Why it is disabled

Listed in [`eng/vally-adapter/skip-evals.txt`](../../../eng/vally-adapter/skip-evals.txt).
Before it can be taken off that list:

1. **The package pins are unverified.** `Microcks.Testcontainers`, `Testcontainers`,
   `Microsoft.AspNetCore.Mvc.Testing`, `FakeItEasy`, `NSubstitute` and `Moq` have never been
   restored from this fixture. The worker cannot fix a bad pin itself — the executor's
   permission handler rejects `dotnet add package` and `dotnet restore`.
2. **The `microcks-default` stimulus needs a container runtime** if its wiring is ever executed
   rather than only read out of the diff.
3. **The cost has not been budgeted.** Three stimuli × `runs: 3` on `claude-sonnet-4.6`, with a
   `dotnet restore` per trial.

## Running it once the above is settled

```bash
SKIP_EVALS="" ./eng/run-vally-evals.sh agents mock-integration-worker
```
