---
name: refinement-proposal
description: "Use when reviewing one GitHub issue and proposing its refinement as a comment: Definition of Ready check, Fibonacci size and capacity estimate, ready or needs-refinement verdict, a proposed story with domain examples and acceptance criteria, what is vague or non-compliant in the current criteria, checked against a PRD or BRD under docs/ when the issue links one. Runs from the /skraft-refine command or a GitHub Agentic Workflow. Not for refining a whole sprint or triaging a backlog."
---

# Refinement Proposal

One issue in, one comment out. `{skill}` is the folder that holds this SKILL.md. Run every
command from the repository root and call the scripts by their path,
`node {skill}/scripts/<name>.mjs`: `docs/` and every relative path are read from the
repository root, never from `{skill}`. Work in `/tmp/gh-aw/agent/skraft-refine/{number}/` in a
GitHub Agentic Workflows run, in `.copilot-tracking/skraft-refine/{number}/` otherwise; call it
`{work}`.

Load before step 4: `issue-refinement`, `issue-triage`, `github-issue-search`. Load before
step 5: `planning-review-criteria`, `backlog-review-lenses`.

## 1. Skip work already done (not in a workflow run: the workflow checked before starting)

```sh
node {skill}/scripts/refine-marker.mjs check --repo <owner/repo> --issue <number> [--force]
```

`todo=false` → answer with its `reason` and stop. Pass `--force` only when the user asked for it.

## 2. Read the issue

Read title, body, labels and comments through `github-issue-search`. Save the issue as JSON
with at least `title` and `body` to `{work}/issue.json`.

## 3. Language

Write every sentence you produce — story, examples, criteria, notes, defects, gaps — in the
language of the issue's title and body; when they differ, the body's. Set `language` to its
two-letter code (`fr`, `en`, `es`…). Never translate quoted text from the issue.

## 4. Assess and propose

1. Documents: `node {skill}/scripts/resolve-docs.mjs --issue-file {work}/issue.json --docs docs` and
   copy its output into `docs`. Read the `used` documents only, and list in `docs.gaps` where
   the issue contradicts them or misses a rule they state. Never read or argue from a
   `candidates` entry: it is listed for the user to confirm.
2. Definition of Ready of the issue **as written**: the 8 items of `issue-refinement`, each
   `pass` or a `note` naming what is missing.
3. Current acceptance criteria: one `acDefects` entry per problem, quoting the criterion —
   vague (two readings, no threshold), not testable, duplicate, technical (HTTP codes, class
   names, endpoints), antipattern, breaks INVEST; `missing` when the issue has none.
4. Proposed story: a specific persona (never "user"; `personaInferred: true` when the issue
   does not name it), at least 3 domain examples with real values taken from the issue, its
   comments and the used documents, and at least 3 Given/When/Then criteria, each with the
   `example` it comes from. Add no business rule the issue or a used document does not state:
   name the open question in a `dor` note instead.
5. INVEST of the proposed story, antipatterns found, Fibonacci `size.points` with its
   justification; above 8, a `size.split` into stories of 8 or less.
6. `triage.type` and `triage.priority` per `issue-triage`; `related`: up to 5 open issues
   found with 2–3 domain terms of the title, classified EXACT / NEAR / RELATED.

Write `{work}/proposal.json` per [the proposal schema](references/proposal-schema.md), then:

```sh
node {skill}/scripts/check-proposal.mjs --proposal {work}/proposal.json
```

Exit 2 lists the problems: fix them and re-run until it exits 0. Never compute readiness,
the DoR tally or the days yourself: the scripts do.

## 5. Review

Run the `refine` review of `backlog-review-lenses`: dispatch `planning-invest-lens`,
`planning-ac-quality-lens` and `planning-dor-lens`, each with only its inputs in the `refine`
column of `planning-review-criteria`, then `review-verdict.mjs --phase refine`. On
NEEDS_REWORK or REJECTED, revise `proposal.json` with the script's `blocking` findings and
review again — two attempts in all. Record `review.verdict`, `review.attempts`, and, when the
last verdict is not APPROVED, its blocking findings in `review.unresolved`.

## 6. Render and publish

```sh
node {skill}/scripts/render-comment.mjs --proposal {work}/proposal.json --issue-file {work}/issue.json --out {work}/comment.md
```

Post `{work}/comment.md` as one new comment through the write route of
`github-issue-search`, byte for byte, on issue `{number}`: its last line is the
`<sub>skraft-refine v=… hash=…</sub>` marker the next run
looks for. Add no label unless the caller asked for labels.

Answer with one line: readiness, size, and the comment link when the host returned one.
