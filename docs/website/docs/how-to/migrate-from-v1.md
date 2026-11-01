---
title: "Migrate a working copy from v1"
description: "Convert a v1 configuration and the v1 runs in progress with skraft migrate, check with a dry run, resume a migrated run, lift the refusals."
persona: software-engineer
---

# Migrate a working copy from v1

Take over in V2 a repository left by skraft v1, without losing the runs in progress.

## Prerequisites

- The `skraft` plugin at version 2 installed
  ([Install skraft on a host](./install-on-a-host.mdx)); `skraft` is the command that [`npm i -g @skraft/cli`](./install-on-a-host.mdx#skraft-command) sets up; the long line `node "<plugin folder>/engine/drivers/cli/skraft.mjs"` works without it.
- A terminal at the root of the working copy, Git, Node 22 or later.
- The v1 files committed, so you can go back: `skraft-config.json` is rewritten in place.

## 1. See what the migration would write

```console
$ skraft migrate --dry-run
```

```text
skraft-config.json: dropped trackingLayout and observability; skraft init would then list the components it finds; their bases are not shown
would write skraft-config.json:
  {
    "baseBranch": "main"
  }
would-migrate  checkout-flow: DISTILL restarts at distill, RESEARCH and DESIGN closed; 1 artefact path of the completed phases dropped (outside-run 1); resume it with skraft init checkout-flow
  would append: {"type":"run.started","slug":"checkout-flow",…,"migratedFrom":"v1"}
  would append: {"type":"phase.closed","phase":"RESEARCH"}
  would append: {"type":"phase.closed","phase":"DESIGN"}
skipped  shipped: the v1 run is DONE; nothing to migrate
skraft migrate: 1 to migrate (dry run: nothing written), 1 skipped, 0 refused
```

Nothing is written. Read each line:

- **the configuration**: the v1 keys (`trackingLayout`, `observability`, `depthTier`,
  `depthTierRationale`) are dropped, the V2 keys kept, then the components detected;
- **each v1 run in progress** (`state.json` with no `events.jsonl`): its completed phases are
  closed, its current phase restarts at its first node. An artefact path outside the run's
  folder, absolute or unreadable is dropped and counted;
- a run v1 finished (`DONE`) is skipped.

## 2. Lift what is refused

The command exits with 1 while a run is refused or a configuration key maps to nothing. Fix it,
then run step 1 again.

| Line | Action |
|---|---|
| `skraft-config.json: <keys> map to no key of V2; it is left as it is: move or remove them, then migrate again` | Remove or move those keys: at the top level V2 reads only `components`, `baseBranch`, `tdd`, `publish`, `models`, `assign` ([skraft-config.json](../reference/skraft-config.md#top-level)). |
| `refused  <slug>: state.json holds a field the v1 state schema does not declare; nothing was migrated` | This `state.json` is no v1 state: restore it from Git, or leave this run aside and start it again in V2. |
| `refused  <slug>: state.json names a phase the workflow skraft does not hold; nothing was migrated` | Its current phase does not exist in the V2 workflow: start this run again under a new slug. |
| `skipped  <slug>: already has a journal (events.jsonl); state.json is left as it is` | Nothing to do: this run is already a V2 run. |

## 3. Migrate

```console
$ skraft migrate
```

```text
skraft-config.json: dropped trackingLayout and observability; skraft-config.json: billing (javascript, .)
migrated  checkout-flow: DISTILL restarts at distill, RESEARCH and DESIGN closed; 1 artefact path of the completed phases dropped (outside-run 1); resume it with skraft init checkout-flow
skipped  shipped: the v1 run is DONE; nothing to migrate
skraft migrate: 1 migrated, 1 skipped, 0 refused
```

Each migrated run gets a signed `events.jsonl`; `state.json` is never changed. Running the
command again changes nothing (`already migrated from v1`), and a migration that stopped halfway
is completed on the next run.

## 4. Check the configuration

```console
$ skraft doctor
```

Read the components `skraft-config.json` now lists and complete their commands if needed
([Configure components](./configure-components.md)).

## 5. Resume a migrated run

```console
$ skraft init checkout-flow
$ skraft status
```

```text
checkout-flow is the active pipeline
skraft checkout-flow: running
RESEARCH  closed
DESIGN  closed
DISTILL  pending
```

Then resume the run from your host, like any V2 run
([Resume or unblock a run](./resume-a-run.mdx)).

## Troubleshooting

| Message | Action |
|---|---|
| `the environment names no home folder (HOME or USERPROFILE), where the key that signs the journal is kept; …` | Set `HOME` (or `USERPROFILE` on Windows), then run again: the key that signs the journals is kept in the home folder. |
| `base-unresolved` | Write `baseBranch` in `skraft-config.json`, then run again. |
| `workflow-invalid` | The workflow ejected under `.skraft/` is invalid: `skraft workflow check` lists the errors ([Copy and adapt the workflow](./eject-workflow.mdx)). |
| `config-invalid` | Fix every error listed, then run again. |
| the command prints the usage and exits with 2 | `migrate` takes only `--dry-run` and `--json`. |

## Next steps <!-- #next-steps -->

- [`skraft migrate`](../reference/cli.md) — text and JSON output, exit codes.
- [Tracking folder and journal](../reference/run-journal.md) — what
  replaces `state.json`.
- [Changelog: V2 breaking changes](../reference/changelog.md#v2-breaking)
