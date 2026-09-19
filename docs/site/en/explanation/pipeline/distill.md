---
layout: doc
lang: en
title: "DISTILL"
persona: software-engineer
---

# DISTILL

{% include phase-ribbon.html current="distill" %}

The DISTILL phase transforms architecture decisions into executable specifications.

## What enters, what exits

| | |
|---|---|
| **Comes from** | **DESIGN** — the ADR and the event model |
| **What enters** | Architecture decisions to specify |
| **What exits** | Gherkin scenarios + test plan + implementation plan; approved reporting flow adds a forecast |
| **Goes to** | **DELIVER** — which implements them with TDD |
| **Responsible agent** | `acceptance-designer` |
| **Associated reviewer** | `acceptance-designer-reviewer` |

## Why this phase exists

Gherkin scenarios serve as a contract between business and code. The acceptance-designer writes Given-When-Then scenarios that capture expected behaviour. The reviewer verifies that every acceptance criterion is covered and that scenarios are testable.

> « Specification by Example bridges the communication gap between business and technology. »
> — Adzic, G., *Specification by Example*, 2011.

<div class="fil-rouge" markdown="1">
<span class="fil-rouge__label">☕ Running example — Starbucks <em>(illustrative)</em></span>

The ADR and event model enter. DISTILL writes the **Gherkin scenario**: “Given a cart with a latte / When payment is approved / Then a receipt is issued and loyalty points are credited.” This scenario becomes the contract DELIVER must turn green.
</div>

## What the agent produces

- `.feature` files in Gherkin format with Given-When-Then.
- Coverage matrix linking each acceptance criterion to a scenario.
- Implementation plan ordering tests by layer (Domain, Application, Infrastructure, API).
- Identification of Test Doubles needed at each boundary.

## From approved plan to forecast

**Reporting integration is in progress.** In the approved flow, the
[acceptance designer]({{ "/en/dashboard/#agent-acceptance-designer" | relative_url }})
owns the test plan, criterion-to-scenario/test traceability and expected impact.
The [acceptance reviewer]({{ "/en/dashboard/#agent-acceptance-designer-reviewer" | relative_url }})
checks those inputs in the existing review. After DISTILL approval, deterministic
rendering projects them into a Markdown forecast before DELIVER when a PR is available.
The forecast describes **planned** checks, never an executed result or invented metric.

This keeps the artifact chain explicit: **DESIGN decisions → reviewed scenarios and
test plan → forecast → DELIVER evidence → outcome**. The orchestrator coordinates
publication; neither a reporting agent nor another review panel is introduced.

Startup choices select full PR reports, an issue link, full report or no issue report,
a chat summary, and an explicit media cap with no hard default. PR full + issue link +
chat summary is recommended, not automatic. Confirmed targets and choices persist for resume.
Without a selected PR/MR, the forecast stays pending: creating a draft requires user
approval and an exposed host operation; pushing requires separate consent. Local
reporting scripts create no PR and push nothing.

The forecast is the first of two stable PR comments; the second records completion or
blockage. Scripts render and validate locally; the orchestrator handles remote
publication through the host. For GitHub, the shipped
[github-search-protocol]({{ "/en/dashboard/#skill-github-search-protocol" | relative_url }})
owns the procedure: MCP first, announced host `gh` fallback only when MCP or a required
capability is unavailable under the skill's policy. No external companion skill is
required. Azure DevOps/GitLab remain MCP-only reporting targets, not full-pipeline support.

The receipt compares host readback locally, not through an independent network check
by scripts. An issue link needs the matching PR/MR receipt's returned URL; without it,
the pointer stays pending and no permalink is invented. These are Markdown comments,
not uploaded reports or hosted files. Publication recovery reuses the saved report,
not a new engineering run. Abandoning an unresolved local attempt requires explicit
human confirmation and a reason; it preserves receipts and does not undo a remote write.

Provider mappings have local fixture tests only; live availability and end-to-end host
integration remain unverified. Rendering once avoids repeated synthesis, not transmission
or readback work. Issue links and chat summaries avoid repeating full reports; no
measured token savings or price is claimed.

Source anchors for this in-progress protocol:
[MCP CLI acceptance contract](https://github.com/SebastienDegodez/skraft-plugin/blob/main/tests/skraft-framework/reporting/report-mcp-cli.acceptance.test.mjs),
[MCP handoff contract](https://github.com/SebastienDegodez/skraft-plugin/blob/main/tests/skraft-framework/reporting/report-mcp-handoff.acceptance.test.mjs),
[preferences policy](https://github.com/SebastienDegodez/skraft-plugin/blob/main/plugins/skraft-framework/src/domain/reporting-preferences.mjs)
and [forecast renderer](https://github.com/SebastienDegodez/skraft-plugin/blob/main/plugins/skraft-framework/src/application/render-report.mjs).
Publication does not replace the specification review described above.

## Gates crossed here

This phase crosses gates **G1–G8** (see the [gates catalogue]({{ "/en/reference/gates" | relative_url }})).
Each gate is checked by the independent reviewer before moving on to **DELIVER**.
