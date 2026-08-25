# contract-testing-worker — agent suite (DISABLED)

Migrated from the GENESIS evals removed by `97705d8` *feat(evals): adopt vally evaluation
pipeline*:

| GENESIS source | Landed as |
|---|---|
| `evals/contract-testing-worker/content.yml` — 3 fixtures | [`eval.yaml`](eval.yaml) — 3 stimuli |
| `evals/contract-testing-worker/triggers.yml` — 20 triggers | [`triggers.yml`](triggers.yml) — preserved, not executed |

## What changed in the translation

- **`expected_output` / `forbidden` → graders.** Each bullet became a deterministic grader
  (`diff-contains`, `output-matches`, `skill-invocation`) rather than a judge prompt, so a
  verdict does not depend on a second model's reading.
- **`value_delta` disappeared.** It described a with_skill / without_skill delta, and an agent
  suite is single-arm — the runner executes it once through `skraft-agent-runner`, there is no
  baseline to compare against. The behaviour each delta claimed is now asserted directly.
  A real paired comparison belongs in `eng/experiments/*.experiment.yaml`.
- **`seed_context` → `environment.files`.** What the GENESIS eval described in prose (stack,
  presence of `skraft.instructions.md`, presence of contract artifacts) is now a staged
  workspace, so the opt-in cascade is exercised by a real tool call instead of a claim.
- **Triggers were not translated.** See the header of [`triggers.yml`](triggers.yml).

## Why it is disabled

Listed in [`eng/vally-adapter/skip-evals.txt`](../../../eng/vally-adapter/skip-evals.txt).
Three things have to be true before it can be taken off that list:

1. **The package pins are unverified.** `fixtures/eligibility-provider/Directory.Packages.props`
   declares `Microsoft.AspNetCore.Mvc.Testing` and `Microcks.Testcontainers` at versions that
   have never been restored. Resolve them against the live feed first — the worker cannot fix
   them itself, because the executor's permission handler rejects `dotnet add package` and
   `dotnet restore`.
2. **Layer 2 needs a container runtime.** `TestEndpointAsync` boots a real Microcks container
   and exposes a host port to it. The stimulus only grades the emitted wiring, never runs it,
   but a future `run-command` grader on the suite would need Docker on the runner.
3. **The cost has not been budgeted.** Three stimuli × `runs: 3` on `claude-sonnet-4.6`, with a
   `dotnet restore` per trial.

## Running it once the above is settled

```bash
SKIP_EVALS="" ./eng/run-vally-evals.sh agents contract-testing-worker
```
