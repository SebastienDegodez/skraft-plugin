---
name: qa-reporting
description: >-
  Use when preparing QA forecast or outcome Markdown from approved plans and
  recorded delivery evidence, including DISTILL forecast handoff, blocked
  delivery summaries, and checking report data against its sources. Not for
  running tests, deciding quality gates, or publishing prepared Markdown.
---

# QA reporting

## Load by task

- Before preparing or checking report data, read
  [report contract](references/report-contract.md) for ownership, fields, source
  refs and media boundaries. Use its JSON shape; do not add fields.
- When referencing gates or evidence, load `skraft-quality-bar`: it owns the
  thresholds; this skill defines neither. Render an outcome only from a quality
  evidence file the CLI accepts (see the report contract); the engine's gate
  records are not one.
- For rendering, use the bundled [forecast](assets/templates/forecast.md) or
  [outcome](assets/templates/outcome.md) template through the existing CLI.
  Do not copy a template into the consumer project or rebuild its layout by hand.

## Prepare or check data

1. Identify kind, story, full source revision, language and exact returned source
   refs. Keep generated JSON and Markdown in the consumer's dispatched output
   directory, never inside the installed skill. Do not reconstruct dated paths.
2. Forecast: project existing approved AC/design and DISTILL plans into criteria,
   planned tests and sourced expected impact. Do not invent criteria, replan work
   or describe planned tests as passing.
3. Outcome: reuse the approved forecast/plan and actual evidence, change log and
   media manifest. State expected versus observed impact, missing proofs and
   blockers, including when delivery stopped. Delivery is not deployment proof.
4. Preserve source metrics, statuses and limitations. Missing evidence stays
   unverified; aggregate gate success or screenshots alone do not prove an AC.
5. Keep producer and review roles apart. Review lenses check supplied data
   read-only within their review, never render, repair or issue a second verdict;
   the cold-reader lens gets no producer context. Bind only the exact persisted
   `reviewRef` the brief gives, after the review.

## Render checked data

Render after the relevant review is persisted; a blocked outcome retains that
verdict and missing evidence. The report CLI is `scripts/report/cli/report.mjs` in
the scripts/ folder next to this SKILL.md; `<skill>` below is the absolute path of
the folder holding this SKILL.md. Keep the working directory at the consumer
repository root and run
`node "<skill>/scripts/report/cli/report.mjs" render --slug {slug} --data {report.json} --out {report.md}`
with actual returned repository-root-relative paths and quoted arguments.

Use the CLI's fixed forecast/outcome template selection. Missing template,
invalid data or command failure is a visible blocker, not permission to invent
a replacement report. Return invalid source data to its producer. Keep the CLI's
JSON result and exact Markdown path; do not rewrite computed facts or verdicts.

Return data path, Markdown path when rendered, source refs and unresolved items.
Do not run tests, capture new evidence, decide gates or change pipeline state
for report preparation. Do not spawn a reporting agent.

Publish only when your brief asks for it, under the
[host publication lifecycle](references/mcp-publication.md). Publication-only retries reuse Markdown, not engineering
runs or another report synthesis.