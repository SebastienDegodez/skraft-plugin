---
name: strangler-fig-method
description: "Use to REPLACE part of an existing brownfield system incrementally — behind a routing facade, one slice at a time, verified by contract equivalence against a green safety net — rather than restructuring it in place. Loaded internally by brownfield-refactorer when the human chooses replacement over Mikado in-place restructuring."
disable-model-invocation: true
---

# Strangler Fig Method

Replaces a component by growing a new implementation alongside the old one, behind a facade that
routes traffic, slice by slice, until the old implementation has no callers left and can be
deleted. Unlike Mikado (restructure what exists), this method REPLACES it — appropriate when the
existing code is too coupled to restructure safely, or when the target is a different stack/design
entirely.

**Precondition.** Same as Mikado: a green safety net (`characterize-with-contracts` /
`brownfield-harness-builder`) must exist first. Here the safety net does double duty — it is
replayed against BOTH the old and the new implementation; a slice only cuts over when the new
implementation is contract-equivalent to the old one on every test in the harness.

## Procedure

### 1. Establish the facade

Introduce (or confirm an existing) routing seam in front of the component being replaced — a
gateway route, a feature-flagged branch, or a proxy layer — such that traffic can be switched
per-slice between OLD and NEW without touching callers. If no seam exists, this is the first
prerequisite: build the facade itself as slice zero, verified by the harness against the OLD
implementation only (no NEW yet — this slice just proves the facade is transparent).

### 2. Slice the surface

Partition the component's contract (the same contract discovered/reconstructed by
`characterize-with-contracts`) into independently-cutover-able slices. Default granularity for v1:
**one slice per route/endpoint** — smaller slices mean smaller blast radius per cutover and finer
rollback granularity than a whole-component slice.

### 3. Build one slice's NEW implementation

Implement the NEW version of one slice. Run the SAME characterization tests for that slice's
contract against the NEW implementation (not just the old). This is the contract-equivalence
check — Microcks/contract tests are the perfect fit here because they assert against the SAME
`OPEN_API_SCHEMA`, regardless of which implementation answers.

### 4. Cutover gate (S4 — non-negotiable)

A slice cuts over ONLY when:

- The slice's characterization tests pass against NEW with the same assertions used against OLD
  (contract-equivalent — same status codes, same shapes; deliberate behavior CHANGES must be
  called out explicitly to the human as a decision, never silently absorbed as "equivalent").
- The full harness (all other slices, still routed to whichever implementation currently serves
  them) remains green.

If the gate fails: do not cut over. Record the mismatch as a blocker (see terminal signals below)
and keep routing that slice to OLD.

### 5. Repeat, then strangle

Repeat steps 3-4 for each slice. Once every slice routes to NEW and the facade shows zero traffic
to OLD (verify via routing logs/metrics if available, or via a final "OLD is unreachable" static
check), the OLD implementation and the facade's OLD branch are dead code, removable as a final
slice of their own.

## Plan persistence (the durable artifact)

Persist the slice plan to `.copilot-tracking/skraft-plans/{projectSlug}/refactoring/{YYYY-MM-DD}/
strangler-<slug>.md` as a table, one row per slice:

| Slice | Contract surface | Status | Cutover verdict | Notes |
|---|---|---|---|---|
| S1 | POST /orders | done (NEW live) | PASS (equivalent) | — |
| S2 | GET /orders/:id | in-progress | CONCERNS | pagination shape differs — flagged to human |
| S3 | DELETE /orders/:id | not-started | — | — |

One writer on this file per run (`brownfield-refactorer`); reload before dispatching each slice
worker, not from recall.

## Driving slices to completion (per-slice worker contract)

Each slice is dispatched to `refactoring-worker` as a fresh, isolated unit. The dispatch packet
MUST include: the current slice plan table, the specific slice to implement (contract surface +
current status), the cutover acceptance criteria from step 4 verbatim, and the explicit
instruction to flag (never silently resolve) any behavior difference between OLD and NEW.

## Terminal signals (worker -> orchestrator)

- `ADVANCE` — this slice cut over cleanly; more slices remain.
- `EXPAND` — this slice was too large to cut over as one unit; it was split into smaller slices
  (new rows added to the plan); no cutover happened for this dispatch.
- `DONE` — all slices are on NEW, OLD is confirmed unreachable, and the OLD implementation +
  facade branch have been removed.
- `BLOCKED` — a contract-equivalence mismatch needs a human decision (is the behavior difference
  intentional? acceptable? a bug in NEW?), or the facade itself cannot route cleanly.

## Common failure modes (reject these)

- **Silently absorbing a behavior difference as "close enough"** — any NEW-vs-OLD difference is a
  human decision, not an implementation detail to smooth over.
- **Cutting over a slice without replaying the FULL harness** — a slice can look correct in
  isolation while breaking a cross-slice interaction still routed to OLD.
- **Skipping the facade-transparency check (slice zero)** — cutting traffic before proving the
  facade itself is invisible makes every later slice's signal unreliable.
- **Deleting OLD before confirming zero traffic** — always verify unreachability before removal;
  a forgotten caller still pointed at OLD becomes a silent outage.
