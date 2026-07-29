---
name: ordered-test-list
description: Use when starting any non-trivial feature, fix, or refactoring with TDD and the temptation is to generate the whole implementation in one block. Forces a preliminary planning phase producing an ORDERED test list across the pyramid (unit, integration, end-to-end) where each entry declares its behavioral (BDD) name, the Transformation Priority Premise (TPP) transformation that will turn it green, and the logical contradiction that forces the existing code to evolve. Then constrains execution to one test at a time (FLFI - Failing, Least, Fast, Incremental). Applies even when the developer only says "implement X", "code this story", or "add this rule" without naming TDD, TPP, or test planning.
---

# Ordered Test List (TPP + FLFI)

## Overview

Bulk code generation skips the design pressure TDD exists to create.
This skill splits delivery in two: **PLAN the ordered test list first**, then
**execute it strictly one test at a time**.

**Hard rules:**
1. No production code before the ordered test list exists and is written down.
2. One RED at a time — the list is consumed head-first, never in parallel.
3. Each GREEN applies exactly the TPP transformation planned for that entry — nothing more.

The list is a plan, not a contract with the future: it is re-evaluated after each
GREEN (see *Re-planning*), but never bypassed.

## Phase A — Preliminary planning (before any production code)

Analyse the behavior (Gherkin scenario, story, bug report) and emit an ordered
list of tests spanning the three pyramid levels. Order is the deliverable: it
encodes the sequence in which the design is allowed to emerge.

For EACH entry, declare four fields:

| Field | Content |
|---|---|
| **Level** | `unit` \| `integration` \| `e2e` — see `outside-in-tdd` for boundary placement |
| **Semantics** | Behavioral name, BDD style (`WhenCondition_ShouldOutcome`). Business language only — no class or endpoint names |
| **TPP transformation** | The single transformation (see table below) that takes the code from the previous GREEN to this one |
| **Logical contradiction** | The rule or mechanism the current code CANNOT satisfy, and which therefore forces it to evolve. If nothing contradicts, the test is redundant — drop it |

### Template (emit verbatim, one row per test)

```markdown
| # | Level | Semantics (BDD) | TPP transformation | Logical contradiction |
|---|-------|-----------------|--------------------|-----------------------|
| 1 | e2e   | WhenOrderIsPaid_ShouldEmitReceipt | ({} -> nil) | Nothing exists: the boundary is absent |
| 2 | unit  | WhenCartIsEmpty_ShouldRejectPayment | (unconditional -> if) | A single unconditional answer cannot serve two cases |
| 3 | unit  | WhenCartHasItems_ShouldChargeTotal | (constant -> scalar) | The hardcoded amount contradicts a variable cart |
```

Persist the list as an artifact next to the implementation plan
(`.copilot-tracking/skraft-plans/{projectSlug}/details/{date}/test-list-{story}.md`
when the SKRAFT artifact layout applies) so the executor can re-ground on it
instead of relying on recall.

## TPP transformation table (ordered, simplest first)

Pick the HIGHEST entry in this table that makes the next test pass. A lower
entry chosen early is the signature of a design jump.

| Priority | Transformation | Meaning |
|---|---|---|
| 1 | `({} -> nil)` | no code at all -> code that returns nothing |
| 2 | `(nil -> constant)` | return a literal |
| 3 | `(constant -> constant+)` | a simple constant -> a more complex one |
| 4 | `(constant -> scalar)` | a literal -> a variable or argument |
| 5 | `(statement -> statements)` | add unconditional statements |
| 6 | `(unconditional -> if)` | split the path with a conditional |
| 7 | `(scalar -> array)` | a variable -> a collection |
| 8 | `(array -> container)` | an array -> a richer container |
| 9 | `(statement -> tail-recursion)` | repeat by tail recursion |
| 10 | `(if -> while)` | turn a conditional into a loop |
| 11 | `(statement -> non-tail-recursion)` | repeat by full recursion |
| 12 | `(expression -> function)` | extract an expression into a function |
| 13 | `(variable -> assignment)` | replace the value of a variable |
| 14 | `(case)` | add a case to an existing switch / match |

## Ordering rules (FLFI)

- **F — Failing:** every entry must be able to fail for a business reason. An
  entry that would pass on the current code has no contradiction — remove it.
- **L — Least:** among the candidate next tests, choose the one whose GREEN needs
  the transformation with the HIGHEST priority (smallest jump). Degenerate and
  boundary cases come before general cases; the general case is reached by
  accumulated transformations, not by a leap.
- **F — Fast:** prefer the level giving the fastest trustworthy feedback. The e2e
  or acceptance entry opens the list (it is the outer RED and stays red), then
  units drive the inside; integration entries come once the inner loop is green
  (see `outside-in-tdd` concentric circles).
- **I — Incremental:** one entry = one behavior slice = one commit. If an entry
  needs two transformations to go green, it is two entries.

## Phase B — Sequential execution (one entry at a time)

For the head of the list, and only for it:

1. **Write ONE test** — exactly the entry's semantics. Nothing else is added to
   the suite.
2. **Reach a legitimate RED** — behavior failure, not compilation. Mechanics are
   owned by `red-synthesize-green`; follow it exactly, including the mandatory
   architectural / developer validation step.
3. **GREEN by the planned transformation** — apply the declared TPP
   transformation and stop. Code not required by the active test is forbidden,
   even if a later entry will obviously need it.
4. **Validate and move on** — run the suite, commit, mark the entry done, then
   take the next entry.

## Re-planning (allowed, tracked)

After a GREEN, the emerged design may invalidate part of the list. Re-planning is
legitimate when it is explicit:

- Record what changed and why (entry added, removed, reordered, transformation
  revised).
- Never re-plan to justify code already written — that is retro-fitting.
- Never merge two entries to save a cycle.

## Red flags — STOP

- Production code written before the list exists.
- Two failing tests at once (except the outer acceptance test kept red on purpose).
- A GREEN that implements a later entry "while we are here".
- An entry without a logical contradiction (the test proves nothing).
- An entry without a declared transformation (design jump hidden in prose).
- The list produced AFTER the implementation to document it.

## Common rationalizations

| Excuse | Reality |
|---|---|
| "The feature is small, the list is overhead" | A 3-entry list costs one minute and still forbids the block-generation reflex. |
| "I already know the final design" | Then the transformations are trivial to name. Name them; the order is the proof. |
| "Writing the general case now saves a cycle" | It removes the contradiction that justified the next test — the design stops emerging. |
| "The tests are planned in my head" | Unwritten plans degrade across the session. Persist the list. |
| "I will reorder as I go" | Reordering is allowed once recorded. Silent reordering is bulk generation with extra steps. |

## Integration with other skills

- `outside-in-tdd` — pyramid levels, boundary placement, double loop. Consumed
  when assigning a level to each entry.
- `red-synthesize-green` — mechanics of RED -> validation -> SYNTHESIZE GREEN for
  each entry. This skill decides WHICH test and IN WHICH ORDER; that skill owns HOW.
- `test-design-mandates` — which cases deserve a test at all.
- `mutation-testing` — runs after the list is fully consumed, before merge.
