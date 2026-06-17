# Cost-economics process detail (load on demand)

Load this file when the active design needs to apply the cost-stance
knob, the cap mechanism, or step 3.2 (cost check) at full detail.
The SKILL.md body names the shape; this file holds the procedure.

Trigger for loading:
- Operator declared a cost stance in step 1.
- Step 3.2 cost check is in scope (default for any non-trivial work).
- Step 6 cost projection or step 8 cost checklist is being run.

---

## Cost stance (read at step 1)

Stance shapes the SHAPE of the design (which patterns are picked).
It does NOT cap the size of the design. Four values; default
`balanced`:

### frugal

Posture: minimize spend; accept ~15-20% quality risk on
non-blast-radius decisions.
Pattern mandates: B12, B15, B16 declared; A12 preferred over flat
panels at fan-out >= 3; cheapest role class meeting capability
profile; forbid mid-session model switch.

### balanced (default)

Posture: best $/quality per primitive. The posture genesis ships
as default.
Pattern mandates: B13 always (largest lever, no quality tradeoff);
role class chosen per slot; B14 PROMPT THRIFT at validation when
within 80% of size budget.

### quality

Posture: optimize for capability ceiling; pay for it.
Pattern mandates: planner-class for planner/critic slots even
when implementer-class meets capability; B14 still on (prose bloat
isn't a quality lever); B15 considered at >20 tools; A12 considered
when bulk-execution stage runs >10x.

### unbounded

Posture: research / capability-ceiling work; architect explicitly
opts out of self-limiting.
Pattern mandates: none. Persona warns once that unbounded is in
effect, then proceeds. Cost projection STILL recorded
(predictability without prescription).

### How operator declares stance

- First prompt: "design this in frugal mode" / "go unbounded".
- Per harness convention: see `runtime-affordances/per-harness/<x>.md`
  stance binding section.
- Session-scoped config (genesis reads `stance:` from plan store).

If none declared, default `balanced`.

---

## Cost budget cap (optional, read at step 1, enforced at step 6)

Cap shapes the SIZE of the design (whether to redo it smaller)
and is orthogonal to stance. Stance can be `quality` and cap can
be tight; they are independent.

Cap is a hard ceiling expressed as one of:

- DOLLAR cap per representative run (e.g. "$5 per PR review").
- TOTAL TOKEN cap per representative run (e.g. "100K tokens").
- PREMIUM REQUEST cap (per the harness's billing unit).

Cap is enforced at step 6. If the cost projection's L scenario
exceeds the cap, the design halts and surfaces three options to
the operator:

1. Widen the cap.
2. Change stance (typically toward `frugal`).
3. Accept a coarser pattern (collapse a panel into a single
   reviewer, drop a verification stage, narrow scope).

Cap is the ONLY place genesis refuses to proceed on cost grounds.
Without a cap, projection is informational; with one, projection
is a gate.

---

## Step 3.2 - cost check in full

Load `assets/token-economics.md` (substrate vocabulary) and
`assets/runtime-affordances/model-catalog.md` (role classes). For
each module in the component diagram:

1. **Role class.** Cheapest class meeting capability profile.
   Role-class definitions and selection axes live in
   `model-catalog.md`; the binding decision rule lives in
   `design-patterns.md` §B12 SELECTION RULE.
2. **Prefix shape.** Audit STABLE bytes vs VARIABLE suffix. If any
   B13 invalidator names itself (timestamps in stable bytes,
   mid-session catalogue mutation, mid-session model switch, mid-
   session effort change, edits to project rule files), apply
   B13 CACHE-AWARE PREFIX. Invalidator list canonical in
   `token-economics.md` §5 CACHE INVALIDATOR.
3. **Output volume.** Estimate S / M / L band per
   `token-economics.md` "Cost-shape vocabulary". L-in-loop triggers
   R5 COST PRUNE (consider R1 split or S7 delegation).
4. **Tool surface.** If primitive sees >20 tools and uses <5 per
   call, apply B15 TOOL SUBSET. Deterministic sequence -> S7.
5. **Workflow shape.** Heterogeneous-cost stages -> name A12
   GRADIENT WORKFLOW.
6. **Apply stance.** Stance mandates above (frugal / balanced /
   quality / unbounded).
7. **Tradeoffs.** Two cost patterns fitting one slot -> load
   `pattern-tradeoffs.md` §10 Cost-shape and cite the row.

### Output of step 3.2

A short table the architect carries forward to step 6:

| Module | Role class | Prefix size | Output volume | Cost patterns applied | Cost-shape matrix row |
|--------|------------|-------------|---------------|------------------------|------------------------|
| ...    | ...        | ...         | ...           | ...                    | ...                    |

---

## Step 6 - cost projection in full

The projection lives in the handoff packet alongside the diagrams
and module composition table. It has six parts:

### 1. Per-module qualitative bands

Vocabulary per `assets/token-economics.md`:
- Role class.
- Prefix size: S (<5K) / M (5-20K) / L (20-100K) / XL (>100K).
- Output volume: S (<500) / M (500-3K) / L (>3K).
- Expected turn count: low (1-3) / medium (4-10) / high (10+).

These bands are the CONTRACT. Step 8 validates them.

NOTE: cache hit ratio is intentionally NOT in the contract. Cache
hit ratio is a runtime telemetry number; most harnesses do not
surface it per-request to the agent, and step 8 cannot statically
verify it. Cache hit ratio is observed at runtime and feeds R5
COST PRUNE evidence, not the design-time contract.

### 2. Workflow-level quantitative range

For ONE representative run, a range estimate:
- Expected input tokens (low-high).
- Expected output tokens (low-high).
- Expected total turns (low-high).
- Expected dollar / credit / request range (low-high).

Source the multipliers from the per-harness adapter's pricing
footnote. Record the footnote's "verified on YYYY-MM-DD" date
stamp.

A range, not a point estimate. Operators want to know the
worst case, not the average.

### 3. Workload scenarios

Operators projecting against unknown corpora need anchors. At
minimum three:

- S = trivial / single-file change.
- M = feature in a known module.
- L = repo-wide change (refactor across N files; full audit).

Each scenario gets the quantitative range from part 2 projected
to its size. The L scenario is the cap check input.

### 4. Cited cost patterns

The B12 / B13 / B14 / B15 / B16 / A12 / R5 patterns the design
applies, each with the cost-shape matrix row that motivated it.

### 5. Declared stance

The stance read at step 1, recorded verbatim.

### 6. Cap check

If a cap was declared, verify each scenario fits under it. If
the L scenario exceeds the cap, halt the design and surface the
three options (widen cap / change stance / coarser pattern).

---

## Step 8 - cost checklist (not a gate)

This step is a CHECKLIST the architect runs against emitted modules,
not a programmatic gate. There is no lint script today; honest naming.
A future `scripts/cost-lint.sh` can grep for the named invalidators
(timestamps in stable prefix, hardcoded model names) but until that
exists, the checklist is human-applied.

After the emitted modules pass structural lint, verify:

1. Each emitted module's role-class binding matches the
   projection's per-module bands. (Reviewer should be reviewer-
   class in the emitted code, not silently promoted to
   planner-class.)
2. No emitted module introduces a cache invalidator the
   projection assumed absent (audit each body for
   timestamps, mid-session tool catalogue mutations,
   mid-session model switches, mid-session effort changes).
3. Every pattern cited in the projection's COST PATTERNS list
   is materialized in at least one emitted module's body.
4. Stance-mandated patterns are visible:
   - `frugal` -> B12 / B15 / B16 each appear somewhere.
   - `quality` -> planner-class promotions show up in role
     bindings.
5. The cap, if declared, still holds after any last-mile edits.

Failures are HIGH severity. They do not block ship outright (the
operator may accept a regression knowingly), but they MUST be
surfaced in the validation report so the operator decides.
