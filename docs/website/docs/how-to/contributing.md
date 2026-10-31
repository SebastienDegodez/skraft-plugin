---
title: "Propose a pattern or fix the documentation"
description: "Propose a new pattern the genesis way (problem, solution, published reference), open the pull request that carries it, read the evaluation verdict, and fix a handbook page in FR and EN."
persona: tech-lead
---

# Propose a pattern or fix the documentation

**Goal**: bring a pattern into skraft, or fix a handbook page, through a pull request the team can
accept.

:::info[Genesis]
A pattern enters skraft only with three things: an observed problem, a solution
that worked in at least one real context, and a published reference that argues for the same
approach. Without them it is a preference, which everyone works around as soon as the context
changes. How skraft then makes each practice enforceable:
[Software craftsmanship](../explanation/software-craftsmanship.md).
:::

## Prerequisites

- A fork of the `skraft-plugin` repository, a branch created from `main`, Node 22 or later.
- `npm install` run at the root of the clone.

## Propose a pattern

1. **Write the problem in one sentence**, from the point of view of whoever suffers from it. Not
   "we should structure the tests better", but "acceptance tests fail for infrastructure reasons:
   the business logic is not isolated".
2. **Describe the solution as observable behaviour**: what it changes in the pipeline, the
   artifacts or the code produced, and what it does not change.
3. **Find the published reference** (book, article, talk) and add it to
   `docs/site/_data/citations.yml` if it is not there.
4. **Write the pattern**: the `SKILL.md` under `plugins/<plugin>/skills/<skill>/`, or the agent
   descriptor in both agent trees, then `npm run plugin:sync` and `npm run plugin:check`.
5. **Write its evaluation spec**:
   [Evaluate a skill](./evaluate-a-skill.md).
6. **Open the pull request**, with the problem, the solution and the reference in its
   description.
7. **Read the verdict** CI posts as a comment (`9W/4T/2L (p=0.065)`): only a `regression` blocks
   the merge;
   [Read an evaluation verdict](../explanation/deep-dive/reading-a-verdict.md)
   says what to do with the others.

A figure put forward without a source is rephrased qualitatively and suffixed `(estimated)`.

## Fix a handbook page

1. Edit the page under `docs/site/fr/` **and** its twin under `docs/site/en/` (same English file
   name).
2. For a new page, declare it in `docs/site/_data/book.yml`, in FR and EN.
3. Check the citations:

   ```console
   $ npm run lint:citations
   ```

   Expected result: `All citations valid.`
4. Open the pull request with a description of the change.

## See also

- [Patterns](../reference/patterns.md) — each pattern and its reference.
- [Citations](../reference/citations.mdx)
- [Evaluate a skill](./evaluate-a-skill.md)
