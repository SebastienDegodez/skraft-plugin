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
- When referencing gates or evidence, load
  [quality-gates-evidence-contract](../quality-gates-evidence-contract/SKILL.md)
  and [skraft-quality-bar](../skraft-quality-bar/SKILL.md). They own evidence
  semantics and thresholds; this skill defines neither.
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
5. Keep existing producer/reviewer roles. Reviewers check supplied data read-only
   within their existing review, never render, repair or issue a second verdict.
   Keep all four core lenses and their isolated inputs; no producer context goes
   to cold-reader. Router binds only the exact persisted `reviewRef` after review.

## Render checked data

The existing router renders after the relevant review is persisted; a blocked
outcome retains that verdict and missing evidence. Resolve
[report CLI](../../src/cli/report.mjs) relative to this skill directory into
`report_cli`; keep the working directory at the consumer repository root.
Invoke `node "$report_cli" render --slug {slug} --data {report.json} --out {report.md}`
with actual returned repository-root-relative paths and quoted arguments.

Use the CLI's fixed forecast/outcome template selection. Missing template,
invalid data or command failure is a visible blocker, not permission to invent
a replacement report. Return invalid source data to its producer. Keep the CLI's
JSON result and exact Markdown path; do not rewrite computed facts or verdicts.

Return data path, Markdown path when rendered, source refs and unresolved items.
Do not run tests, capture new evidence, decide gates or change pipeline state
for report preparation. Do not spawn a reporting agent.

For a requested publication handoff, give existing Markdown to the router under
[host publication lifecycle](../../assets/reporting/mcp-publication.md); do not
execute transport here. Publication-only retries reuse Markdown, not engineering
runs or another report synthesis.