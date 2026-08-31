---
description: "Project SKRAFT pipeline state into the harness-native todo list (Claude Code TodoWrite / Copilot CLI todos+todo_deps) as the disposable in-session working set, regenerated at rehydration and never the source of truth"
applyTo: '**/.copilot-tracking/skraft-plans/**'
---
<!-- markdownlint-disable-file -->
<!-- PORTABILITY: orchestrator-owned. Only the skraft-orchestrator loads this file
     (it projects state into the native todo list); sub-agents never touch it. `applyTo:`
     above is Copilot auto-load metadata (belt); on harnesses without path-scoped
     auto-load (e.g. Claude Code) the orchestrator loads it via the explicit read
     declared in its "Companion instructions" block (suspenders). Harness-neutral;
     per-harness tool syntax lives inline where noted. -->

# SKRAFT Todo Sync (native working set)

The durable `state.json` snapshot is authoritative (see `#file:plugins/skraft-framework/com.github.copilot/rules/skraft-state.instructions.md`). This instruction projects that snapshot into the **harness-native todo list**, which becomes the in-session working set the orchestrator consults every turn — instead of re-reading the whole JSON file.

The native todo list is **disposable**: it is regenerated from the snapshot at each rehydration and is **never the source of truth**. If the two ever disagree, the snapshot wins and the todo list is rebuilt. Native todo tools cost near-zero tokens to query, so per-turn state inspection stops paying the whole-file read/write tax.

## What projects, and what does NOT

Project the pipeline **structure** (phases, statuses, dependencies) into todos. Keep pipeline **scalars/invariants** in the snapshot only — the todo schema does not carry them and they must stay under deterministic control:

| Stays in `state.json` (never a todo) | Why |
|---|---|
| `entryPoint`, `adrRatification` | structured, gate-bearing, direct-edited |
| `verdicts`, `retryCount` | invariant-bearing, CLI-owned |
| `userPreferences`, `neighborPlanners` | configuration / interop |

The todo list carries only: one todo per phase, its status, and the phase ordering as dependencies. When the orchestrator needs a scalar, it fetches just that field with `state.mjs get --field X` — it does not stuff scalars into todo text.

## Projection rules (snapshot → todos)

Build one todo per pipeline phase, in canonical order `DISCOVER → DISCUSS → DESIGN → DISTILL → DELIVER`:

1. **Status** from the snapshot:
   * phase in `phasesCompleted` → **done**
   * phase == `currentPhase` → **in_progress**
   * otherwise → **pending**
   * a phase listed in `entryPoint.skipPhases` → **done** (satisfied by an upstream handoff), annotated `(skipped: handoff)`.
2. **Dependencies**: each phase depends on the previous one (linear chain). A phase cannot start until its predecessor is done.
3. **Current-phase detail (optional sub-todos)**: for `currentPhase` only, you may expand three ordered sub-todos — `dispatch specialist`, `dispatch reviewer`, `handle verdict` — to track the intra-phase loop. Collapse them again once the phase is done.
4. **DESIGN gate**: when `currentPhase == "DESIGN"` and `adrRatification.checkpointStatus == "awaiting_human"`, keep the DESIGN todo **in_progress** and add a blocking sub-todo `await ADR ratification (human)`; DISTILL stays **pending** regardless of the DESIGN reviewer verdict.
5. **Terminal**: when `currentPhase == "DONE"`, all five phase todos are **done**.

Regenerate this projection at every rehydration (Phase 0). Do not mutate the todo list from stale memory — always derive it from the snapshot just read.

## Per-harness mechanism

The projection is identical; only the tool syntax differs. Use the mechanism native to the running harness.

### Claude Code — `TodoWrite`

Emit the full list in one `TodoWrite` call. Encode ordering by listing phases in sequence (Claude Code todos have no explicit dependency field; order + status convey the chain). Exactly one todo is `in_progress` at a time.

```
TodoWrite todos=[
  { "content": "DISCOVER", "status": "completed",   "activeForm": "Running DISCOVER" },
  { "content": "DISCUSS",  "status": "in_progress", "activeForm": "Running DISCUSS" },
  { "content": "DESIGN",   "status": "pending",     "activeForm": "Running DESIGN" },
  { "content": "DISTILL",  "status": "pending",     "activeForm": "Running DISTILL" },
  { "content": "DELIVER",  "status": "pending",     "activeForm": "Running DELIVER" }
]
```

Map SKRAFT status → Claude status: done → `completed`, in_progress → `in_progress`, pending → `pending`.

### Copilot CLI — `todos` + `todo_deps`

Use the native SQL-backed tables. Insert one row per phase with a kebab-case id, then one dependency edge per adjacent pair. Statuses: `done` → `done`, in_progress → `in_progress`, pending → `pending`.

```sql
INSERT OR REPLACE INTO todos (id, title, description, status) VALUES
  ('discover', 'DISCOVER', 'SKRAFT phase DISCOVER', 'done'),
  ('discuss',  'DISCUSS',  'SKRAFT phase DISCUSS',  'in_progress'),
  ('design',   'DESIGN',   'SKRAFT phase DESIGN',   'pending'),
  ('distill',  'DISTILL',  'SKRAFT phase DISTILL',  'pending'),
  ('deliver',  'DELIVER',  'SKRAFT phase DELIVER',  'pending');

INSERT OR IGNORE INTO todo_deps (todo_id, depends_on) VALUES
  ('discuss', 'discover'),
  ('design',  'discuss'),
  ('distill', 'design'),
  ('deliver', 'distill');
```

Query the ready phase (no unmet dependency) instead of re-reading `state.json`:

```sql
SELECT t.* FROM todos t
WHERE t.status != 'done'
AND NOT EXISTS (
  SELECT 1 FROM todo_deps d JOIN todos p ON d.depends_on = p.id
  WHERE d.todo_id = t.id AND p.status != 'done'
)
ORDER BY t.id LIMIT 1;
```

## Reconciliation

The write-through protocol keeps the two in step: after every `state.mjs` write (verdict, transition, artifact, retry), reflect the same change into the todo list (mark done / in_progress, add the next). The snapshot is written first (durable), the todo list second (working set). On the next session, the todo list is discarded and rebuilt from the snapshot — so a lost or diverged todo list never corrupts pipeline state.
