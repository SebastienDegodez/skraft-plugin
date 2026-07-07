---
name: adversarial-review-lenses
description: "Use when a reviewer agent must produce an adversarial verdict via 4 independent lenses and weighted synthesis (Genesis A7 pattern)"
---

# Adversarial Review Lenses

Reviewer agents use this procedure to produce an independent, defensible verdict on a phase artifact. Pattern derived from Genesis Step 7 (Adversarial Review).

## When to use

Every SKRAFT phase reviewer (`backlog-discoverer-reviewer`, `backlog-planner-reviewer`, `solution-architect-reviewer`, `acceptance-designer-reviewer`, `software-engineer-reviewer`) invokes this skill once per review pass, after reading the upstream phase artifact(s) and the relevant `*-review-criteria` skill.

The number of lenses actually executed is governed by the repo-wide depth tier (held in `skraft-config.json`; read with `config.mjs get --key depthTier`, or taken from the orchestrator's dispatch payload):

| Depth tier | Lenses required |
|---|---|
| `basic` | 1 (Completeness only) |
| `standard` | 2 (Completeness + Business Fit) |
| `comprehensive` (default) | 4 (all lenses) |
| `custom` | as configured in `userPreferences.customDepth.reviewerLenses`, minimum 1 |

## The four lenses

Each lens is executed **in isolation**. The reviewer must not let observations from one lens influence another. Run them in this order, recording each lens's findings independently before computing the synthesis.

### Lens 1 — Completeness

Does the artifact cover every input that fed into the phase?

- Are all referenced issues, requirements, or upstream artifacts addressed?
- Are there obvious gaps (missing scenarios, missing components, missing acceptance criteria)?
- Are the mandatory sections required by the phase's `*-review-criteria` skill all present and non-empty?

Output: a list of completeness findings, each tagged `MISSING`, `THIN`, or `OK`.

### Lens 2 — Business Fit

Does the artifact correctly reflect the business intent?

- Vocabulary matches the domain lexicon (e.g. `business-lexicon.instructions.md` when present).
- Acceptance criteria express observable business behavior, not technical implementation.
- No invented requirements, no scope creep beyond the input.

Output: a list of business-fit findings, each tagged `MISALIGNED`, `AMBIGUOUS`, or `OK`.

### Lens 3 — Quality

Is the artifact internally consistent and well-structured?

- Cross-references are valid (paths exist, IDs resolve).
- No contradictions between sections.
- Style follows the relevant authoring instructions (markdown, prompt-builder, story-quality, etc.).
- The artifact is self-contained enough that a downstream phase can consume it without additional context.

Output: a list of quality findings, each tagged `BROKEN`, `INCONSISTENT`, or `OK`.

### Lens 4 — Risk

What could go wrong downstream because of this artifact?

- Are immutable invariants from `skraft-difficulty-routing` respected (TDD, Clean Architecture boundaries, test integrity, dated paths, reviewers read-only)?
- Are the assumptions explicit and bounded?
- Are there hidden coupling points to neighbor planners (Security, RAI, SSSC) that the artifact silently violates?
- Could a sub-agent dispatched on this artifact be misled into producing incorrect code or design?

Output: a list of risk findings, each tagged `INVARIANT_VIOLATION`, `HIDDEN_COUPLING`, `AMBIGUOUS_ASSUMPTION`, or `OK`.

## No-contamination rule

While executing a lens, do not consult findings from another lens. Write the lens's findings to its own section in the review file before starting the next lens. If a finding seems to apply to multiple lenses, record it under each lens independently with the appropriate tag — do not merge.

## Weighted synthesis

After all required lenses have run, compute the verdict using fixed lens weights:

| Lens | Weight |
|---|---|
| Completeness | 0.30 |
| Business Fit | 0.30 |
| Quality | 0.15 |
| Risk | 0.25 |

Per-lens score in `{0, 0.5, 1}`:

- `1.0` — all findings are `OK`.
- `0.5` — at least one finding is non-OK but none are `INVARIANT_VIOLATION` or `BROKEN`.
- `0.0` — at least one finding is `INVARIANT_VIOLATION`, `BROKEN`, or `MISSING`.

Weighted sum maps to the verdict:

| Weighted sum | Verdict |
|---|---|
| `>= 0.85` and no lens scored `0.0` | `APPROVED` |
| `>= 0.55` | `NEEDS_REWORK` |
| `< 0.55`, **or** any lens scored `0.0` on an invariant | `REJECTED` |

A single `INVARIANT_VIOLATION` finding in Lens 4 forces `REJECTED` regardless of the weighted sum.

## Output format

Write the review under `reviews/{YYYY-MM-DD}/{phase}-{slug}-review.md`. Begin the file with `<!-- markdownlint-disable-file -->`, then the following structure:

```markdown
<!-- markdownlint-disable-file -->

# {Phase} Review — {slug}

**Verdict:** APPROVED | NEEDS_REWORK | REJECTED
**Depth tier:** basic | standard | comprehensive | custom
**Lenses executed:** N
**Weighted score:** 0.XX
**Reviewed artifacts:** {relative paths}

## Lens 1 — Completeness
- finding 1 [TAG] — short description
- ...

## Lens 2 — Business Fit
- ...

## Lens 3 — Quality
- ...

## Lens 4 — Risk
- ...

## Synthesis
{2–4 sentences explaining the verdict, the dominant lens, and the required next actions if any}

## Required actions before next attempt
- {bulleted list — present only when verdict is NEEDS_REWORK or REJECTED}
```

The reviewer writes only this file. It never modifies upstream artifacts and never edits `state.json` — the orchestrator records `state.json::verdicts[phase]` from the verdict line above via `state.mjs record-verdict`.

## HVE alignment

Review artifact location and naming follow the HVE convention documented in `.copilot-tracking/reviews/code-reviews/review-artifacts.instructions.md` (resolved via the HVE-Core fallback path when the file is absent locally). SKRAFT places its reviews under `.copilot-tracking/skraft-plans/{slug}/reviews/{YYYY-MM-DD}/` rather than `reviews/code-reviews/`, but the metadata schema and verdict normalization are identical.
