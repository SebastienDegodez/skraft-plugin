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

- Are immutable invariants from `skraft-difficulty-routing` respected (TDD, Clean Architecture boundaries, test integrity, dated paths, reviewers read-only)?
- Are the assumptions explicit and bounded?
- Are there hidden coupling points to neighbor planners (Security, RAI, SSSC) that the artifact silently violates?
- Could a sub-agent dispatched on this artifact be misled into producing incorrect code or design?

Output: a list of risk findings, each tagged `INVARIANT_VIOLATION`, `HIDDEN_COUPLING`, `AMBIGUOUS_ASSUMPTION`, or `OK`.

## No-contamination rule

While executing a lens, do not consult findings from another lens. Write the lens's findings to its own section in the review file before starting the next lens. If a finding seems to apply to multiple lenses, record it under each lens independently with the appropriate tag — do not merge.

## Weighted synthesis

The synthesis is computed **per question, not per lens**. That is what makes it work for a
three-lens phase and a four-lens phase alike, and it is why the weights below never need
renumbering when a phase gains or loses an instrument.

1. **Map.** For each lens that ran, record which question(s) it answers. When the phase's
   `*-review-criteria` skill declares the mapping, use it verbatim. When it does not, derive
   the mapping from what the lens actually checks and state the derivation in the synthesis —
   an underived mapping is an assumption, and assumptions do not belong in a verdict.
2. **Score each question** in `{0, 0.5, 1}` using the scale below. When several lenses answer
   the same question, the question takes the **lowest** of their scores. The strictest
   instrument wins, exactly as the dissent rule requires.
3. **Halt on a gap.** A question that no lens answered is not scored `1.0` and is not skipped.
   The verdict is `NEEDS_REWORK` with the uncovered question named, because an unasked
   question cannot come back clean.

| Question | Weight |
|---|---|
| Completeness | 0.30 |
| Business Fit | 0.30 |
| Quality | 0.15 |
| Risk | 0.25 |

Per-question score in `{0, 0.5, 1}`:

- `1.0` — all findings are `OK`.
- `0.5` — at least one finding is non-OK but none are `INVARIANT_VIOLATION` or `BROKEN`.
- `0.0` — at least one finding is `INVARIANT_VIOLATION`, `BROKEN`, or `MISSING`.

Weighted sum maps to the verdict:

| Weighted sum | Verdict |
|---|---|
| `>= 0.85` and no question scored `0.0` | `APPROVED` |
| `>= 0.55` | `NEEDS_REWORK` |
| `< 0.55`, **or** any question scored `0.0` on an invariant | `REJECTED` |

A single `INVARIANT_VIOLATION` finding under the Risk question forces `REJECTED` regardless of the weighted sum.

In the emitted verdict, `lensCount` is the number of lenses that actually ran — the evidence
of the fan-out. The `synthesis` rows are the four questions. The two numbers differ on
purpose: one says how the work was done, the other says what was judged.

## Output format

Begin the review file with `<!-- markdownlint-disable-file -->`, then the following structure:

```markdown
<!-- markdownlint-disable-file -->

# {Phase} Review — {slug}

**Verdict:** APPROVED | NEEDS_REWORK | REJECTED
**Lenses executed:** N
**Weighted score:** 0.XX
**Reviewed artifacts:** {relative paths}

## {phase lens name}
- finding 1 [TAG] — short description
- ...

## {next phase lens name}
- ...

(one section per lens that ran, named as the phase's `*-review-criteria` names it)

## Questions

| Question | Answered by | Score | Weight | Contribution |
|---|---|---|---|---|
| Completeness | {lens name(s)} | 0.X | 0.30 | 0.XX |
| Business Fit | {lens name(s)} | 0.X | 0.30 | 0.XX |
| Quality | {lens name(s)} | 0.X | 0.15 | 0.XX |
| Risk | {lens name(s)} | 0.X | 0.25 | 0.XX |

## Synthesis
{2–4 sentences explaining the verdict, the dominant lens, and the required next actions if any}

## Required actions before next attempt
- {bulleted list — present only when verdict is NEEDS_REWORK or REJECTED}
```

The reviewer writes only this file. It never modifies upstream artifacts and never edits `state.json` — the orchestrator records `state.json::verdicts[phase]` from the verdict line above via `state.mjs record-verdict`.

## Where the review is written

`.copilot-tracking/skraft-plans/{slug}/reviews/{YYYY-MM-DD}/`

The filename comes from the dispatching reviewer's own declared `outputs`, not from here.
That is the whole contract — there is no external convention file to fetch first.
