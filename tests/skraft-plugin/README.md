# SKRAFT plugin evals — `tests/skraft-plugin`

Behavioural evaluation suites for the SKRAFT 5D pipeline, executed by the
[skraft-test-harness](../../tools/skraft-test-harness/) (`evaluate` and
`verify-checkpoint` commands).

## Principle: functionality and conformance, never vocabulary

These suites test **what the agents produce on a real codebase**, not whether
they can recite the right words. There are exactly two kinds of suite:

| Kind | Directory | What it proves |
|---|---|---|
| **Functionality** (LIVE) | [`pipeline/`](pipeline/) | The orchestrator runs a phase and **produces** the expected artefacts/code; we assert the result. |
| **Conformance** (deterministic) | [`phase-conformance/`](phase-conformance/) | The committed seed checkpoints still match the artefact **format** a phase expects. No agent, no LLM. |

There are no prompt-only "does the agent say the right thing" Q&A suites — those
were vocabulary tests and have been removed.

## The reference workspace: an empty Clean Architecture skeleton

The fixture
[`fixtures/clean-architecture-app/`](../../tools/skraft-test-harness/fixtures/clean-architecture-app/)
is a buildable .NET Clean Architecture skeleton (`OrderDiscount.Domain /
Application / Infrastructure / Api` + test projects) that **carries no feature
yet**. The feature to build is described by a **GitHub issue passed in the
prompt** (the *order* checkout-with-loyalty-discount issue). The agents must
populate the skeleton; we verify what they produced.

## The golden rule

> **We never archive in the repo what the agents produce.**
> Every run executes in an **ephemeral clone** of the fixture (a temp directory
> deleted at the end). The committed skeleton is never mutated, and the agent's
> output (code or `.copilot-tracking/` artefacts) is never committed.

## How a phase eval works

```
  empty CA skeleton  ─┐
  (committed fixture) │  cloned into an
                      ├─►  ephemeral temp dir ─►  the ORCHESTRATOR runs the phase
  issue in the prompt ┘                           ─►  the agent PRODUCES code/artefacts
                                                  ─►  we assert the expected output
                                                  ─►  the clone is deleted (nothing committed)
```

1. **Start from the skeleton (+ the prior phase's state).** The base is the
   empty `clean-architecture-app`. From DISCUSS onward, the prior phases'
   `.copilot-tracking` state is **overlaid** on top (the skeleton code is
   preserved, `bin/`/`obj/` are excluded so the clone is pristine).
2. **The orchestrator drives.** The pipeline always launches from
   `skraft:skraft-orchestrator` — the single entry point. We evaluate one phase
   at a time by telling it to run only that phase and stop once its reviewer
   returns `APPROVED`.
3. **The agent produces, we verify.** Assertions target the *new* artefacts the
   phase must create (and, for DELIVER, the feature code in `src/`) plus the
   reviewer's `APPROVED` verdict.

### Assertion vocabulary

- `file_matches_glob: "research/**/*-research.md"` — a produced artefact exists.
- `file_contains: { glob: "...", text: "APPROVED" }` — a file contains expected content.
- `file_judge: { glob: "...", criterion: "..." }` — an LLM checks a business
  criterion on the produced files (e.g. "the discount rule lives in the Domain layer").
- `output_*` — observable claims in the agent's final answer (supporting, never
  the sole assertion).

## The 5D pipeline suites — `pipeline/`

One directory per phase, **order-prefixed** so the run order is explicit:

| Suite | Phase | Starts from | Verifies the agent produced… |
|---|---|---|---|
| [`01-DISCOVER`](pipeline/01-DISCOVER/) | DISCOVER | skeleton only | triage of the order issue + `APPROVED` review |
| [`02-DISCUSS`](pipeline/02-DISCUSS/) | DISCUSS | + `after-discover` | refined story w/ acceptance criteria + `APPROVED` |
| [`03-DESIGN`](pipeline/03-DESIGN/) | DESIGN | + `after-discuss` | ADR + interface contracts + `APPROVED` |
| [`04-DISTILL`](pipeline/04-DISTILL/) | DISTILL | + `after-design` | executable Gherkin + test plan + `APPROVED` |
| [`05-DELIVER`](pipeline/05-DELIVER/) | DELIVER | + `after-distill` | **feature code in `src/`** + change log + `APPROVED` |

Each scenario is tagged `[<phase>, pipeline, simulation, live]`. The suites are
**LIVE** (consume Copilot quota) and opt-in — never on push/PR.

Every scenario runs **twice** (baseline with `--no-custom-instructions` vs
with-skill with the plugin + orchestrator); assertions decide first and a hybrid
judge breaks ties. A scenario only has value if the with-skill run is observably
better at building the requested feature.

### Running one phase (LIVE)

```bash
cd tools/skraft-test-harness

dotnet run --project src/SkraftTestHarness.Cli -- evaluate \
  --skill skraft-orchestrator \
  --tests-dir ../../tests/skraft-plugin/pipeline/01-DISCOVER \
  --plugin-dir ../../plugins --agent skraft:skraft-orchestrator \
  --fixtures-root ./fixtures
```

Run the suites in order (`01-DISCOVER` → `05-DELIVER`), checking each phase
before moving to the next. The workspace is provisioned automatically from the
declared `fixture` + `checkpoint`; nothing you run mutates the repo.

## The fixtures — `tools/skraft-test-harness/fixtures/`

```
fixtures/
  clean-architecture-app/   # empty net10 CA skeleton (code only, no feature, no .copilot-tracking)
  checkpoints/
    after-discover/         # .copilot-tracking state after DISCOVER (seed input)
    after-discuss/          # + DISCUSS story/plan
    after-design/           # + ADR + contracts
    after-distill/          # + Gherkin + test plan
```

- `clean-architecture-app/` is the **base skeleton**. The provisioner always
  clones it first and excludes `bin/`/`obj/` so the clone is pristine.
- `checkpoints/after-*` are **hand-authored seed inputs** — the `.copilot-tracking`
  state of the *previous* phases, overlaid on the skeleton so a phase can start
  where the prior one left off. They are inputs, **never** the output of a run.

## Checkpoint conformance (`verify-checkpoint`)

The committed seed checkpoints must keep matching the artefact format each phase
expects. `verify-checkpoint` evaluates **only the file assertions** of
[`phase-conformance/eval.yaml`](phase-conformance/eval.yaml) against them — no
agent, no LLM, no quota — on every push/PR (CI step *Verify phase checkpoints*
and the `PhaseConformanceEndToEndTests` integration test).

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

## Two distinct gates — do not confuse them

| Gate | Runs the agent? | Cost | What it checks |
|---|---|---|---|
| `pipeline/**` | **Yes** (LIVE) | Copilot quota | the agent *produces* the expected feature/artefacts |
| `phase-conformance/` + `verify-checkpoint` | No | free, deterministic | the committed seed checkpoints still match the artefact *format* |

The live pipeline is wired in the `live-evals` job of
[`skraft-test-harness.yml`](../../.github/workflows/skraft-test-harness.yml)
(`workflow_dispatch`, never on push/PR); conformance runs on every push/PR.

## Where results go

`--report-dir` emits one JSON `SkillVerdict` per run. The CI pipeline aggregates
them into a benchmark history published **with the documentation site**
(dashboard page, single page shared between FR and EN). Quality history first;
cost/token metrics are planned next.
