---
name: adversarial-review-lenses
description: "Use when reviewing a phase artifact — a discovery brief, a plan, a design, an acceptance specification, or a slice reported as delivered — and the review has to end in a defensible pass-or-block verdict rather than a list of remarks. Covers judging whether the artifact covers everything that fed into it, whether it matches the business intent, whether it holds together internally, and what it puts at risk downstream, then weighing those into a single call. Not for routine code review of an ordinary change."
---

# Adversarial Review Lenses

Reviewer agents use this procedure to produce an independent, defensible verdict on a phase artifact. Pattern derived from Genesis Step 7 (Adversarial Review).

## When to use

Every SKRAFT phase reviewer (`backlog-discoverer-reviewer`, `backlog-planner-reviewer`, `solution-architect-reviewer`, `acceptance-designer-reviewer`, `software-engineer-reviewer`) invokes this skill once per review pass, after reading the upstream phase artifact(s) and the relevant `*-review-criteria` skill.

## Questions and lenses are not the same thing

The four questions below are fixed. Every review answers all four, and a review that leaves
one unanswered is not a review.

The **lenses** that answer them are not fixed. Each phase's `*-review-criteria` skill defines
its own lens set, named for what that phase actually inspects, and the sets differ in size:
DISCOVER runs three, DISCUSS and DELIVER run four. That is by design — the lens is the
instrument, the question is the obligation. Requiring exactly four instruments would force a
phase to invent one it has no gates for, and an invented lens returns `OK` by construction.

What is non-negotiable: **every question is covered by at least one lens**, each lens runs in
isolation, and no lens count is chosen to make a review cheaper.

## The four questions

Each lens is executed **in isolation**. The reviewer must not let observations from one lens influence another. Run them in this order, recording each lens's findings independently before computing the synthesis.

### Question 1 — Completeness

Does the artifact cover every input that fed into the phase?
- Are all referenced issues, requirements, or upstream artifacts addressed?
- Are there obvious gaps (missing scenarios, missing components, missing acceptance criteria)?
- Are the mandatory sections required by the phase's `*-review-criteria` skill all present and non-empty?

Output: a list of completeness findings, each tagged `MISSING`, `THIN`, or `OK`.

### Question 2 — Business Fit

Does the artifact correctly reflect the business intent?

- Vocabulary matches the domain lexicon (e.g. `business-lexicon.instructions.md` when present).
- Acceptance criteria express observable business behavior, not technical implementation.
- No invented requirements, no scope creep beyond the input.

Output: a list of business-fit findings, each tagged `MISALIGNED`, `AMBIGUOUS`, or `OK`.

### Question 3 — Quality

Is the artifact internally consistent and well-structured?

- Cross-references are valid (paths exist, IDs resolve).
- No contradictions between sections.
- Style follows the relevant authoring instructions (markdown, prompt-builder, story-quality, etc.).
- The artifact is self-contained enough that a downstream phase can consume it without additional context.

Output: a list of quality findings, each tagged `BROKEN`, `INCONSISTENT`, or `OK`.

### Question 4 — Risk

What could go wrong downstream because of this artifact?

- Are immutable invariants from `skraft-entry-point-routing` respected (TDD, Clean Architecture boundaries, test integrity, dated paths, reviewers read-only)?
- Are the assumptions explicit and bounded?
- Are there hidden coupling points to neighbor planners (Security, RAI, SSSC) that the artifact silently violates?
- Could a sub-agent dispatched on this artifact be misled into producing incorrect code or design?

Output: a list of risk findings, each tagged `INVARIANT_VIOLATION`, `HIDDEN_COUPLING`, `AMBIGUOUS_ASSUMPTION`, or `OK`.

## No-contamination rule

While executing a lens, do not consult findings from another lens. Write the lens's findings to its own section in the review file before starting the next lens. If a finding seems to apply to multiple lenses, record it under each lens independently with the appropriate tag — do not merge.

## Weighted semantic synthesis

1. **Map.** For each lens that ran, record which question(s) it answers. When the phase's
   `*-review-criteria` skill declares the mapping, use it verbatim. When it does not, derive
   the mapping from what the lens actually checks and state the derivation in the synthesis.
2. **Rate each question internally** as `0`, `0.5`, or `1`. When several lenses answer the
   same question, use the lowest rating. Multiply that rating by the fixed question weight
   and emit only the resulting `contribution`; do not expose a separate `score` field.
3. **Halt on a gap.** A question that no lens answered forces `NEEDS_REWORK` with the
   uncovered question named. An unasked question cannot come back clean.
4. **Preserve dissent.** When lenses disagree, record the disagreement in the semantic
   `dissent` or `dissent_analysis` field defined by that reviewer's YAML contract.
5. **Apply the phase severity matrix.** Contributions support the synthesis but never
   override a phase gate, blocker, invariant, or explicit severity rule.

| Question | Weight |
|---|---|
| Completeness | 0.30 |
| Business Fit | 0.30 |
| Quality | 0.15 |
| Risk | 0.25 |

Internal rating: `1` when all findings are clean; `0.5` when findings exist but none are
`INVARIANT_VIOLATION`, `BROKEN`, or `MISSING`; `0` when any such finding exists. Emit each
question as a named map with `answered_by`, `weight`, and `contribution`. Do not emit a total
score: the named contributions remain auditable without collapsing gate semantics.

## Output format

Emit the exact YAML contract declared by the phase reviewer. Preserve named lens maps,
gate identifiers, severities, concrete findings, recommendations, dissent, question weights,
and contributions. Do not add presentation metadata such as a lens count, numeric score,
list index, or lens score.
The same YAML payload is sent to the artifact command and returned to the caller.

The reviewer writes only this file. It never modifies upstream artifacts and never edits `state.json` — the orchestrator records `state.json::verdicts[phase]` from the verdict line above via `state.mjs record-verdict`.

## Where the review is written

`.copilot-tracking/skraft-plans/{slug}/reviews/{YYYY-MM-DD}/`

The filename comes from the dispatching reviewer's own declared `outputs`, not from here.
That is the whole contract — there is no external convention file to fetch first.
