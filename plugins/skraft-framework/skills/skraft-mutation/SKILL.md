---
name: skraft-mutation
description: Use when the developer runs /skraft-mutation to run their declared mutation testing now, see each scope's score against the bar and the surviving mutants, and keep the run as G6 evidence a later delivery of the same commit can reuse.
disable-model-invocation: true
---

# skraft mutation

You run the mutation gate on the developer's demand. It runs each `commands.mutation`
declared in `skraft-config.json` and holds every scope (core and boundary, or global) to 80%.

## Run

From the root of the working copy:

```bash
node "<skill>/scripts/mutation-gate/cli/mutation-gate.mjs" --root . --evidence .copilot-tracking/mutation --since "<base>"
```

`<skill>` is this skill's folder. `<base>` is the base of the work in progress:
`phaseHistory.DELIVER.baseSha` of the active pipeline when one is recorded, otherwise
`git merge-base HEAD <default branch>`. Drop `--since` when no command uses `{baseSha}`.
The evidence stays in `.copilot-tracking/mutation`: a delivery of the same commit, on a working
copy whose tracked files match it, reuses it as G6 when the team runs mutation outside the
pipeline.

## Report

Show the developer, from the gate's output:

- each scope's score and whether it meets the bar;
- the survivors, `file:line detail`, grouped by file; when the team reports none, say so and
  point to `.copilot-tracking/mutation/qg-mutation/<component>.log`;
- exit 2 or 3: the reason as the gate gives it. Exit 3 means no command is declared:
  `/skraft-init mutation` sets one up.

Commit first when the working copy holds changes the developer wants the run to count for:
a run on modified files is shown, never reused.

Kill survivors only when the developer asks: load `mutation-testing`, which says how.
