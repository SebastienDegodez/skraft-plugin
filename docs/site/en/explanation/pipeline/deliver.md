---
layout: doc
lang: en
title: "DELIVER"
persona: software-engineer
---

# DELIVER

{% include phase-ribbon.html current="deliver" %}

The DELIVER phase implements working code, guided by tests, with empirically verified quality.

## What enters, what exits

| | |
|---|---|
| **Comes from** | **DISTILL** — the Gherkin scenarios + the plan |
| **What enters** | Executable specifications to implement; forecast from the approved reporting flow |
| **What exits** | Tested code + quality evidence (mutation, RED→GREEN); outcome report at completion or blockage |
| **Goes to** | The **Pull Request** — human review then delivery |
| **Responsible agent** | `software-engineer` |
| **Associated reviewer** | `software-engineer-reviewer` |

## Why this phase exists

Code is the only artefact that matters in production. The software-engineer applies Outside-In TDD: Acceptance Tests guide unit tests, which guide implementation. The Mutation Score verifies that tests genuinely protect behaviour. The reviewer is read-only — it never modifies code.

> « We grow working software, guided by tests, from the outside in. »
> — Freeman, S. & Pryce, N., *Growing Object-Oriented Software, Guided by Tests*, 2009.

<div class="fil-rouge" markdown="1">
<span class="fil-rouge__label">☕ Running example — Starbucks <em>(illustrative)</em></span>

The scenario enters. DELIVER implements the total calculation and loyalty crediting in **RED → GREEN** cycles, then a **mutation score** attests that the tests genuinely protect the loyalty rule. The code goes to a Pull Request.
</div>

## What the agent produces

- Code implemented following the RED → GREEN → REFACTOR cycle.
- Passing acceptance tests linked to Gherkin scenarios.
- Unit tests covering Domain invariants.
- Mutation Score as empirical proof of test quality.

## From evidence to outcome

**Reporting integration is in progress.** The approved flow turns the DISTILL forecast
into a comparison with actual impact at completion or blockage. The
[software engineer]({{ "/en/dashboard/#agent-software-engineer" | relative_url }})
owns evidence, change log and impact references. The
[engineer reviewer]({{ "/en/dashboard/#agent-software-engineer-reviewer" | relative_url }})
and its existing lenses validate those artifacts and own the canonical verdict.
The orchestrator coordinates rendering and publication, not evidence capture or
review synthesis. There is no extra reporting agent or panel.

The outcome projects recorded tests, build, static checks, coverage, mutation, review,
commits/files and limitations into Markdown. Missing or stale proof stays unverified;
metrics are not invented. A blocked outcome states what remains incomplete. Local
proof checks and the persisted reviewer verdict are distinct: the current renderer
leaves G8/G9 Git-object verification to the reviewer. Delivered does not mean deployed.

For frontend work, existing producers capture Playwright evidence and reviewers check
it. Only already remotely accessible evidence is linked, with access limitations
stated; local-only evidence is explicitly unavailable remotely, never presented as a
published attachment. The startup-selected media cap may be zero and has no hard default.
It limits report links, not local evidence retained for review. Omissions remain visible.
There is no automatic upload, hosting, or browser rerun merely to format the report.

The outcome updates the second stable PR comment; the approved DISTILL forecast
remains the first. Startup choices govern full PR reports, an issue link, full report
or no issue report, and a chat summary. Full destinations reuse the same rendered body; issue pointers are
prepared only after the matching PR/MR receipt supplies its returned comment URL.

Scripts render and validate locally; the orchestrator handles remote publication
through the host. For GitHub, the shipped
[github-search-protocol]({{ "/en/dashboard/#skill-github-search-protocol" | relative_url }})
owns the procedure: MCP first, announced host `gh` fallback only when MCP or a required
capability is unavailable under the skill's policy. No external companion skill is
required. Azure DevOps/GitLab remain MCP-only reporting targets, not full-pipeline support.

A receipt compares host readback locally; it is **not independent script network
verification**. Missing browser URLs leave dependent issue pointers pending, without
invented permalinks. Provider mappings have local fixture tests only; live availability
and end-to-end host integration remain unverified.

On publication failure, local Markdown, pending attempt and per-target receipts survive,
including after `DONE`. Recovery reuses saved reports, not another engineering or
capture run. Forecast/outcome content and review ownership remain unchanged. Abandoning
an unresolved local attempt requires explicit human confirmation and a reason; it
preserves receipts and does not undo a remote write.

Body reuse avoids synthesis, not transmission or readback work. Issue links and chat
summaries avoid repeating full reports; no measured token savings or price is claimed.

Source anchors for this in-progress protocol:
[presentation policy](https://github.com/SebastienDegodez/skraft-plugin/blob/main/plugins/skraft-framework/src/domain/reporting-presentation.mjs),
[local handoff](https://github.com/SebastienDegodez/skraft-plugin/blob/main/plugins/skraft-framework/src/application/report-publication-handoff.mjs),
[MCP handoff contract](https://github.com/SebastienDegodez/skraft-plugin/blob/main/tests/skraft-framework/reporting/report-mcp-handoff.acceptance.test.mjs)
and [MCP CLI acceptance contract](https://github.com/SebastienDegodez/skraft-plugin/blob/main/tests/skraft-framework/reporting/report-mcp-cli.acceptance.test.mjs).
Rendering evidence does not replace the test-guided delivery described above.

## The internal fan-out: test wiring

The `software-engineer` does not wire the integration tests by hand: it **delegates**
that wiring to internal subagents (`user-invocable: false`), one per capability.

| Capability | Worker | Strategy | Fidelity lens |
| --- | --- | --- | --- |
| Mocking (consumer) | `mock-integration-worker` | Microcks by default, overridable in-process | `mock-fidelity-lens` |
| Contract (provider) | `contract-testing-worker` | in-process integration + Microcks opt-in | `contract-fidelity-lens` |

Each worker emits test wiring only — the business TDD cycle stays with the lead, who
verifies the worker in **TIER-1** (the test fails first, then passes). When a
capability is active, its fidelity lens joins the adversarial panel of the
`software-engineer-reviewer`. The concrete wiring is resolved per stack through a
*roster* (see the [agentic catalogue]({{ "/en/dashboard/" | relative_url }})).

## Gates crossed here

This phase crosses the delivery gates — RED/GREEN test integrity, green build,
mutation score at threshold (see the [gates catalogue]({{ "/en/reference/gates" | relative_url }})).
The independent reviewer issues its verdict before delivery is declared approved.
A **draft PR** may already hold the forecast after separately approved creation and
push; opening it does not mean the delivery gates have passed.
