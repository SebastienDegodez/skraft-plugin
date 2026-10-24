---
name: strangler-fig-method
description: "Use to REPLACE part of an existing system incrementally instead of restructuring it in place: put a routing facade in front of it, build the new implementation one slice (route) at a time, cut a slice over only when it is contract-equivalent to the old one on the same characterization tests, and delete the old code once nothing reaches it. Covers the slice plan, the cutover gate and the per-slice worker contract. Not for in-place restructuring (mikado-method)."
---

# Strangler Fig Method

Grow a new implementation beside the old one behind a facade, slice by slice, until the old one has
no caller left. Choose it over Mikado when the code is too coupled to restructure safely or the
target is a different stack or design.

**Precondition.** A green safety net (characterization or contract tests) exists for the component.
It runs against BOTH implementations: a slice cuts over only when NEW passes the same assertions OLD
passes.

## Procedure

1. **Facade (slice zero).** Introduce or confirm a routing seam in front of the component (gateway
   route, feature flag, proxy) that switches traffic per slice without touching callers. Prove it
   transparent: the full harness passes through it with every slice still on OLD.
2. **Slice the surface.** Partition the component's contract into slices that can cut over alone;
   default one slice per route or endpoint.
3. **Build one slice.** Implement NEW for that slice and run the slice's characterization tests
   against NEW, with the assertions used against OLD.
4. **Cutover gate.** Cut over only when both hold:
   - the slice's tests pass against NEW with the same assertions as OLD; any behaviour difference
     goes to the human as a decision, never absorbed as "equivalent";
   - the full harness stays green, every other slice on whichever implementation serves it.
   Gate failed: keep the slice on OLD and report the mismatch.
5. **Strangle.** When every slice is on NEW and nothing reaches OLD (routing logs or metrics, else a
   static check that OLD is unreachable), remove OLD and the facade's OLD branch as a final slice.

## Slice plan file

`.copilot-tracking/skraft-plans/{projectSlug}/refactoring/{YYYY-MM-DD}/strangler-<slug>.md`, one row
per slice, reloaded from disk before each slice and after each worker returns:

| Slice | Contract surface | Status | Cutover verdict | Notes |
|---|---|---|---|---|
| S0 | facade | done | PASS (transparent) | — |
| S1 | POST /orders | done (NEW live) | PASS (equivalent) | — |
| S2 | GET /orders/:id | in-progress | CONCERNS | pagination shape differs — with the human |
| S3 | DELETE /orders/:id | not-started | — | — |

## One slice per worker

Each slice goes to a fresh `refactoring-worker`, one dispatch per slice. The dispatch carries:

1. the slice plan path and its full current content;
2. the slice: contract surface and current status;
3. the cutover gate of step 4, verbatim;
4. "Report every behaviour difference between OLD and NEW; never resolve one yourself."

## Terminal signals (worker → refactorer)

- `ADVANCE`: slice cut over cleanly and committed; slices remain.
- `EXPAND`: slice too large to cut over as one unit; the smaller slices are reported; no cutover.
- `DONE`: every slice on NEW, OLD unreachable, OLD and the facade's OLD branch removed.
- `BLOCKED`: a behaviour difference needs the human, or the facade cannot route cleanly.

## Reject

- A NEW/OLD difference called "close enough".
- A cutover without the full harness.
- Routing traffic before the facade is proven transparent.
- Deleting OLD before confirming nothing reaches it.
