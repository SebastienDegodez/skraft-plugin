---
name: backlog-review-lenses
description: "Use when a triage report, a sprint proposal, refined stories or a refinement proposal for one issue must pass an independent review before it is handed on: dispatching each review lens with only its own inputs, collecting their results and turning them into a verdict with the bundled script. Not for reviewing code, designs or acceptance tests."
---

# Backlog Review Lenses

The producer runs the review gate itself, but never judges its own work: the lenses judge,
the script decides.

## 1. Dispatch

Dispatch every lens of the phase as its own sub-agent, all of them, in parallel when the host
allows it. The phase's `*-review-criteria` skill names the lenses and the inputs each one may
see. Each dispatch prompt carries:

- the paths of the inputs that lens is entitled to, and no other artefact or finding;
- the attempt number;
- the instruction: "Return only the JSON document of your Output section."

Never write a lens result yourself, and never run two lenses in one context. A missing
dispatch is a missing lens, and the script counts it as one.

## 2. Collect

Save each lens answer, verbatim, to its own file next to the review:
`reviews/{date}/{phase}-lens-{lens}-{attempt}.json`. When an answer is not valid JSON,
dispatch that lens once more; if it fails again, save what it returned anyway.

## 3. Decide

Run the script that ships with this skill, from this skill's folder:

```sh
node scripts/review-verdict.mjs --phase discover|discuss|refine \
  --lens <file.json> --lens <file.json> … \
  --attempt <N> --reviewed <artefact path> … \
  --out <reviews/{date}/{phase}-review-{N}.md>
```

Its first output line is JSON with `verdict`, `blocking` and `problems`. Exit codes:
`0` APPROVED, `3` NEEDS_REWORK, `4` REJECTED, `1` a usage error to fix and re-run.

- The verdict is the script's, never yours: do not edit the review file or restate a
  different verdict.
- A lens that is missing, inconclusive or unparseable keeps the verdict at NEEDS_REWORK.
- Two lenses rating the same gate at the same place differently: the strictest applies,
  recorded under `dissent`.
- APPROVED → hand the artefacts on. NEEDS_REWORK or REJECTED → rework with
  `blocking` and the recommendations, then review again, within the producer's retry budget.
