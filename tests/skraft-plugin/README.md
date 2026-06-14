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
prompt**. The agents must populate the skeleton; we verify what they produced.

The prompts carry **only the business issue and which phase to run**. They do
NOT spell out engineering obligations the agent must rediscover from its skills
(outside-in TDD, layer placement, which artefacts to produce) — finding those is
the whole point of the eval. The one exception is **Microcks**, which is *opt-in*
(off by default in the contract-testing skills): a story that needs it states so
explicitly at the business level ("mock the external service / contract-test our
API"), without dictating the technical recipe.

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

## The two stories (pistes) — `pipeline/{piste}/`

Each story is a full 5D pipeline. One directory per story, then one directory per
phase, **order-prefixed** so the run order is explicit.

### `order-checkout` (piste B) — build from scratch

Starts from the **empty skeleton**. Issue #42: build the order checkout applying
a loyalty-tier discount (Green 0% / Gold 5% / Platinum 10%; unknown order → 404).

| Suite | Phase | Starts from | Verifies the agent produced… |
|---|---|---|---|
| [`01-DISCOVER`](pipeline/order-checkout/01-DISCOVER/) | DISCOVER | skeleton only | triage + `APPROVED` review |
| [`02-DISCUSS`](pipeline/order-checkout/02-DISCUSS/) | DISCUSS | + `order-checkout/after-discover` | refined story + `APPROVED` |
| [`03-DESIGN`](pipeline/order-checkout/03-DESIGN/) | DESIGN | + `order-checkout/after-discuss` | ADR + contracts + `APPROVED` |
| [`04-DISTILL`](pipeline/order-checkout/04-DISTILL/) | DISTILL | + `order-checkout/after-design` | Gherkin + test plan + `APPROVED` |
| [`05-DELIVER`](pipeline/order-checkout/05-DELIVER/) | DELIVER | + `order-checkout/after-distill` | **feature code in `src/`** + change log + `APPROVED` |

### `promotion-stacking` (piste A) — extend an existing app, with Microcks

Starts from a baseline where the **checkout already exists**. Issue #57: stack an
active store promotion (provided by the **external Promotions service**) on the
loyalty discount, capped at 20%. Because the feature has a downstream dependency,
the issue opts into **Microcks** for both purposes — mocking the Promotions
service and contract-testing the checkout API.

| Suite | Phase | Starts from | Verifies the agent produced… |
|---|---|---|---|
| [`01-DISCOVER`](pipeline/promotion-stacking/01-DISCOVER/) | DISCOVER | `promotion-stacking/baseline` | triage + `APPROVED` |
| [`02-DISCUSS`](pipeline/promotion-stacking/02-DISCUSS/) | DISCUSS | + `promotion-stacking/after-discover` | refined story + `APPROVED` |
| [`03-DESIGN`](pipeline/promotion-stacking/03-DESIGN/) | DESIGN | + `promotion-stacking/after-discuss` | ADR + contracts + `APPROVED` |
| [`04-DISTILL`](pipeline/promotion-stacking/04-DISTILL/) | DISTILL | + `promotion-stacking/after-design` | Gherkin + test plan + `APPROVED` |
| [`05-DELIVER`](pipeline/promotion-stacking/05-DELIVER/) | DELIVER | + `promotion-stacking/after-distill` | feature code + **Microcks mock (Promotions) AND contract test (checkout)** + `APPROVED` |

Each scenario is tagged `[<phase>, pipeline, simulation, live, <piste>]`. The
suites are **LIVE** (consume Copilot quota) and opt-in — never on push/PR.

Every scenario runs **twice** (baseline with `--no-custom-instructions` vs
with-skill with the plugin + orchestrator); assertions decide first and a hybrid
judge breaks ties. A scenario only has value if the with-skill run is observably
better at building the requested feature.

### Running one phase (LIVE)

```bash
cd tools/skraft-test-harness

dotnet run --project src/SkraftTestHarness.Cli -- evaluate \
  --skill skraft-orchestrator \
  --tests-dir ../../tests/skraft-plugin/pipeline/order-checkout/01-DISCOVER \
  --plugin-dir ../../plugins --agent skraft:skraft-orchestrator \
  --fixtures-root ./fixtures
```

Run a story's suites in order (`01-DISCOVER` → `05-DELIVER`), checking each phase
before moving to the next. The workspace is provisioned automatically from the
declared `fixture` + `checkpoint`; nothing you run mutates the repo.

## The fixtures — `tools/skraft-test-harness/fixtures/`

```
fixtures/
  clean-architecture-app/        # empty net10 CA skeleton (code only, no feature)
  checkpoints/
    order-checkout/              # piste B seed inputs (.copilot-tracking only)
      after-{discover,discuss,design,distill}/
    promotion-stacking/          # piste A seed inputs
      baseline/                  # the DELIVERED checkout code + external Promotions contract
      after-{discover,discuss,design,distill}/   # baseline code + cumulative .copilot-tracking
```

- `clean-architecture-app/` is the **base skeleton**. The provisioner always
  clones it first and excludes `bin/`/`obj/` so the clone is pristine.
- `checkpoints/{piste}/after-*` are **hand-authored seed inputs** — the
  `.copilot-tracking` state (and, for `promotion-stacking`, the existing checkout
  code) of the *previous* phases, overlaid on the skeleton so a phase can start
  where the prior one left off. They are inputs, **never** the output of a run.
- `promotion-stacking/baseline/` provides the already-delivered checkout as a
  hand-authored fixture (recovered from history), so piste A can extend it.

## Checkpoint conformance (`verify-checkpoint`)

The committed seed checkpoints must keep matching the artefact format each phase
expects. `verify-checkpoint` evaluates **only the file assertions** of
[`phase-conformance/{piste}/eval.yaml`](phase-conformance/) against them — no
agent, no LLM, no quota — on every push/PR (CI step *Verify phase checkpoints*
and the `PhaseConformanceEndToEndTests` integration test, parameterised per piste).

```bash
cd tools/skraft-test-harness

# All phases of a story
dotnet run --project src/SkraftTestHarness.Cli -- verify-checkpoint \
  --tests-dir ../../tests/skraft-plugin/phase-conformance/order-checkout \
  --fixtures-root ./fixtures

# One phase
dotnet run --project src/SkraftTestHarness.Cli -- verify-checkpoint \
  --tests-dir ../../tests/skraft-plugin/phase-conformance/order-checkout \
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
