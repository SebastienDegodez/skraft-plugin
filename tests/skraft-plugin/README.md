# SKRAFT plugin evals — `tests/skraft-plugin`

Behavioural evaluation suites for every SKRAFT agent, worker and review
lens, executed by the [skraft-test-harness](../../tools/skraft-test-harness/)
(`evaluate` command). One directory per component, each holding an
`eval.yaml` scenario suite.

## Objective

Prove that **each agent actually does its job on a realistic simulation
of a real application** — not that it can recite the right vocabulary.

Every evaluated run compares two executions of the same scenario:

| Run | What it is |
|---|---|
| **Baseline** | The agent prompt with *no* SKRAFT plugin loaded (`--no-custom-instructions`). |
| **With-skill** | The same prompt with the plugin + agent under test loaded (`--plugin-dir`, `--agent`). |

A verdict is produced per scenario (assertions first; a hybrid judge —
deterministic heuristics, then LLM-as-judge — breaks ties). The suite
only has value if the with-skill run is **observably** better on a task
that resembles real usage.

## The simulation principle

The reference simulation is a minimal but buildable **Clean Architecture
.NET application** (`tools/skraft-test-harness/fixtures/clean-architecture-app/`):
Domain / Application / Infrastructure / Api layers, one existing entity
and use case. Scenarios run the agent **inside a clone of that
workspace** (`--working-dir`) and assert what the agent *produced*, not
just what it *said*:

- `file_exists: "path"` — an exact file was created.
- `file_matches_glob: "reviews/**/deliver-review-*.md"` — a dated/slugged
  artefact exists (SKRAFT artefact paths contain `{projectSlug}` and dates).
- `file_contains: { glob: "...", text: "Verdict: APPROVED" }` — a reviewer
  verdict, state entry, or generated code contains the expected content.
- `output_*` assertions — observable claims in the agent's final answer.

The 5D pipeline (DISCOVER → DISCUSS → DESIGN → DISTILL → DELIVER) is
evaluated **one phase at a time**. Each phase test seeds its workspace
from a committed checkpoint (`fixtures/checkpoints/after-{previous-phase}/`)
containing the `state.json` and artefacts of the phases already done, so
each phase is replayable in isolation and the orchestrator resumes
exactly where a real project would be. Reviewer verdicts written under
`.copilot-tracking/skraft-plans/{slug}/reviews/` are part of the
assertions: a phase only counts as done when its reviewer APPROVED it.

## What makes a scenario *relevant*

There are many tests. A scenario earns its place only if it passes all
four checks:

1. **Realistic input** — the prompt reproduces a situation the agent
   meets in the pipeline (artefacts of the previous phase present in the
   workspace, real file paths, real state). A bare opinion question is
   not realistic input.
2. **Observable outcome** — at least one assertion targets an artefact
   (file created/modified, verdict written, state advanced) or a
   decision with material consequences. Vocabulary-only assertions
   (`output_matches: "(?i)outside[- ]in"`) are insufficient on their own.
3. **Discriminating** — a competent baseline agent *without* the plugin
   should plausibly fail it. If both runs pass, the scenario measures
   nothing.
4. **Not overfitted** — assertions check behaviour, not the exact
   wording of the skill file. Keyword-stuffed answers must not pass
   (the harness judge penalises overlap with skill text).

When reviewing or adding scenarios, apply this checklist. Scenarios that
fail it should be rewritten as simulation scenarios or deleted.

> **Current state / migration**: the historical suites below are
> prompt-only behavioural probes (advice-style Q&A). They remain useful
> as fast smoke checks of each persona's doctrine, but they do not meet
> the simulation bar above. They are being migrated to workspace-based
> scenarios; new scenarios must follow the simulation principle from the
> start.

## Suite inventory

| Suite | Component under test | Kind |
|---|---|---|
| `skraft-orchestrator-agent/` | 5D pipeline entry point, state protocol, phase gating | agent |
| `backlog-discoverer-agent/` + `-reviewer-` | DISCOVER triage / its adversarial review | agent + reviewer |
| `backlog-planner-agent/` + `-reviewer-` | DISCUSS stories / INVEST review | agent + reviewer |
| `solution-architect-agent/` + `-reviewer-` | DESIGN ADRs, contracts / architecture review | agent + reviewer |
| `acceptance-designer-agent/` + `-reviewer-` | DISTILL Gherkin, test plans / review | agent + reviewer |
| `software-engineer-agent/` + `-reviewer-` | DELIVER outside-in TDD / adversarial verdict | agent + reviewer |
| `contract-testing-worker/`, `mock-integration-worker/` | DELIVER sub-agents (contract tests, mock wiring) | worker |
| `architecture-boundaries-lens/`, `cold-reader-lens/`, `contract-fidelity-lens/`, `mock-fidelity-lens/`, `quality-gates-lens/`, `test-integrity-lens/` | software-engineer-reviewer fan-out lenses | lens |

## Running a suite

```bash
cd tools/skraft-test-harness

# Deterministic smoke run (no LLM, CI-safe)
dotnet run --project src/SkraftTestHarness.Cli -- evaluate \
  --skill software-engineer --tests-dir ../../tests/skraft-plugin/software-engineer-agent --mock

# Real run against the Copilot CLI (consumes model quota)
dotnet run --project src/SkraftTestHarness.Cli -- evaluate \
  --skill software-engineer \
  --tests-dir ../../tests/skraft-plugin/software-engineer-agent \
  --plugin-dir ../../plugins --agent skraft:software-engineer \
  --working-dir <clone of fixtures/clean-architecture-app> \
  --report-dir ./reports
```

Live end-to-end phase tests are opt-in via `SKRAFT_COPILOT_LIVE=1`
(see `tests/SkraftTestHarness.IntegrationTest/Cli/`), and in CI via the
`live-evals` job of
[`skraft-test-harness.yml`](../../.github/workflows/skraft-test-harness.yml)
(`workflow_dispatch`, never on push/PR).

## The simulation fixture and the checkpoint chain

The reference workspace and its per-phase checkpoints live under
`tools/skraft-test-harness/fixtures/`:

```
fixtures/
  clean-architecture-app/        # buildable net10 CA app (Domain/App/Infra/Api)
  checkpoints/
    after-discover/              # app + DISCOVER artefacts + APPROVED review
    after-discuss/               # + DISCUSS story/plan + APPROVED review
    after-design/                # + ADR-001 + contracts + APPROVED review
    after-distill/               # + Gherkin + test plan + APPROVED review
```

Each checkpoint contains the cumulative `.copilot-tracking/skraft-plans/order-discount/`
tree (the `state.json` and artefacts of every phase already done) so any phase
is replayable in isolation: a live phase run seeds its workspace from the
**previous** phase's checkpoint and is asserted on what it produces.

`order-discount` is the coffee-shop fil rouge — the feature under construction
is *promotion stacking*: combine an active store promotion with the loyalty-tier
discount, capped so the combined rate never exceeds a guardrail.

## Checkpoint conformance gate (`verify-checkpoint`)

The committed checkpoints must keep matching the artefact format each phase is
supposed to produce. The `verify-checkpoint` command evaluates **only the file
assertions** of [`phase-conformance/eval.yaml`](phase-conformance/eval.yaml)
against the committed checkpoints — no agent, no LLM, no quota — and is run on
every push/PR (CI step *Verify phase checkpoints*, and the
`PhaseConformanceEndToEndTests` integration test):

```bash
cd tools/skraft-test-harness

# All phases
dotnet run --project src/SkraftTestHarness.Cli -- verify-checkpoint \
  --tests-dir ../../tests/skraft-plugin/phase-conformance \
  --fixtures-root ./fixtures

# One phase
dotnet run --project src/SkraftTestHarness.Cli -- verify-checkpoint \
  --tests-dir ../../tests/skraft-plugin/phase-conformance \
  --fixtures-root ./fixtures --tags design
```

Scenarios are categorised with `tags:` (`discover`, `discuss`, `design`,
`distill`, plus `conformance`, `simulation`); `--tags` runs only the scenarios
carrying all the given tags, so a single phase can be verified in isolation.

## Where results go

`--report-dir` emits one JSON `SkillVerdict` per run. The CI pipeline
aggregates them into a benchmark history published **with the
documentation site** (dashboard page, single page shared between FR and
EN). Quality history first; cost/token metrics are planned next.
