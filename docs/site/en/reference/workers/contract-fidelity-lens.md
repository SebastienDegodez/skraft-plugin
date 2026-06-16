---
layout: doc
lang: en
title: "contract-fidelity-lens"
description: "Reviewer lens: audits provider-side contract tests — baseline WAF+HttpClient always present, Microcks layer matches opt-in, TestResult not suppressed, response contract asserted, no real downstream call."
persona: software-engineer
---

# contract-fidelity-lens

> Conditional review lens: audits provider-side contract tests for the five fidelity gates — spawned only when the diff touches a contract, a `VerifyAsync` call, or a provider-side contract test scaffold.

## When active

Spawned by `software-engineer-reviewer` only when the reviewed diff touches:
- An OpenAPI / AsyncAPI contract file
- A `VerifyAsync` or `TestEndpointAsync` call
- A provider-side contract test scaffold (e.g. a class with `TestEndpointAsync`)

Not one of the CORE review lenses. Joins the adversarial panel conditionally, as a capability lens.

## Inputs

- Code and tests from the reviewed diff
- The resolved Microcks opt-in flag (from prompt or `skraft.instructions.md`)

## Output

```json
{
  "lens": "contract-fidelity",
  "verdict": "pass | fail",
  "defects": [{ "id": "D<N>", "gate": "K<N>", "severity": "blocker | high", "location": "file:line", "description": "...", "suggestion": "..." }]
}
```

## Gates

| Gate | Verification | Severity |
|------|-------------|----------|
| K1 | Baseline `WebApplicationFactory` + `HttpClient` present | blocker |
| K2 | Microcks layer matches the opt-in | high |
| K3 | `TestResult.Success` not suppressed when opt-in | blocker |
| K4 | Response contract asserted (status code, content type, `ProblemDetails` shape) | high |
| K5 | No real downstream call leaks | blocker |

**K3 note**: `VerifyAsync` is a consumer-side assertion (mock was hit) and is NOT a substitute for `TestEndpointAsync` result assertion.

## Invariants

- **Read-only** — never modifies code or tests
- **Every finding names the gate** (K1–K5) and a concrete `file:line` location
- **No journal, no checklist** — A7 independence: reports findings without prior context

## Why this shape

A provider contract test that does not assert its result gives false confidence. Each gate closes one common failure mode silently introduced under time pressure.

> « Replace a component that the SUT depends on with a test-specific equivalent. »
> — Meszaros, G., *xUnit Test Patterns*, 2007.

## See also

- [contract-testing-worker]({{ "/en/reference/workers/contract-testing-worker" | relative_url }}) — Worker that produces the contract test this lens audits
- [contract-testing-dotnet]({{ "/en/reference/skills/contract-testing-dotnet" | relative_url }}) — .NET adapter whose output this lens checks
- [contract-testing]({{ "/en/reference/skills/contract-testing" | relative_url }}) — Generic contract authoring skill
- [software-engineer]({{ "/en/reference/agents/software-engineer" | relative_url }}) — DELIVER agent whose reviewer panel activates this lens
