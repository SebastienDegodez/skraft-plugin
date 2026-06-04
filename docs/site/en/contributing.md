---
layout: doc
lang: en
title: "Genesis — the origin of patterns"
description: "Why every SKRAFT pattern exists, how genesis ensures disciplined design, and how to propose a new pattern."
---

# Genesis — the origin of patterns

> Every SKRAFT pattern has a story. Genesis is the disciplined process that ensures a pattern is not born from intuition, but from an identified problem, a validated solution, and a reference that justifies it.

## Why genesis?

An agentic pipeline is only as strong as its patterns. A poorly-designed pattern introduces an arbitrary constraint that nobody understands — and that everyone works around as soon as the context changes.

Genesis enforces one question before anything else: **what problem does this pattern solve, and how do we know?**

The answer must rest on:
1. A concrete observation of the problem (not an intuition),
2. A solution that worked in at least one real context (estimated: several validation iterations),
3. A published reference (book, article, conference) that defends the same approach.

Without these three elements, the pattern is not ready.

## How a pattern enters SKRAFT

### Step 1 — Identify the problem

Describe the problem in one sentence, from the perspective of someone who experiences it. Not: "we should structure tests better". Yes: "acceptance tests fail for infrastructure reasons — business logic is not isolated."

### Step 2 — Formulate the candidate solution

Describe the solution in terms of observable behaviour: what it changes in the pipeline, in artifacts, in the produced code. Be precise about what the solution does not change.

### Step 3 — Find the reference

Every solution defended in SKRAFT must be anchored in a published reference. The reference is not there to appear rigorous — it allows anyone to verify the assumptions behind the solution, and to understand its limits.

Examples of valid references: Evans (DDD, 2003), Freeman & Pryce (GOOS, 2009), Martin (Clean Architecture, 2017), Forsgren et al. (Accelerate, 2018).

### Step 4 — Open a Pull Request

Your PR must contain:
- The `SKILL.md` (or `.agent.md`) file describing the pattern,
- An entry in `docs/site/_data/citations.yml` for each new reference,
- The FR and EN pages in `docs/site/`,
- The update to `docs/site/_data/book.yml` to declare the new pages.

Include in the PR description: the identified problem, the proposed solution, and the reference(s) that justify it.

## What genesis forbids

- **Inventing a metric.** If you claim the pattern reduces bugs by 30%, you must cite the source. Without a source, rephrase qualitatively: "reduces late-detected defects (estimated)".
- **Copying without citing.** Any idea drawn from an external reference must appear in `citations.yml`.
- **Proposing a pattern without a problem.** A pattern without a clearly formulated problem is not a pattern — it is a personal preference.

## Contributing to documentation

To correct or improve an existing page:

1. Fork the repository and create a branch from `main`.
2. Edit pages in `docs/site/fr/` **and** `docs/site/en/` (both languages are required).
3. Check citations:

```bash
node scripts/check-citations.mjs --citations docs/site/_data/citations.yml --pages "docs/site/**/*.md"
```

4. Open a Pull Request with a clear description of the change.

## Sources

- Evans, E., *Domain-Driven Design*, 2003.
- Freeman, S. & Pryce, N., *Growing Object-Oriented Software, Guided by Tests*, 2009.
- Martin, R. C., *Clean Architecture*, 2017.

## See also

- [Customisation](/en/customisation) — what you can adapt and the associated risks
- [The catalogue](/en/catalogue/patterns) — all patterns with their references

