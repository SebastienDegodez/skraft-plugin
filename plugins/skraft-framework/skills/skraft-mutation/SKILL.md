---
name: skraft-mutation
description: Use when the developer runs /skraft-mutation to run their mutation testing now, see each scope's score against the bar and the surviving mutants. The only way SKRAFT runs mutation: the pipeline never does, and G6 stays not_run in every delivery.
disable-model-invocation: true
---

# skraft mutation

You run the mutation gate on the developer's demand, with the command they give you. The
pipeline never runs mutation; this skill is the only place it runs. Every scope (core and
boundary, or global) is held to 80%.

Ask every question below with the host's question tool (`AskUserQuestion` on Claude Code,
`ask_user` on Copilot), never by writing a line and reading the answer from the transcript.

## 1. The command, per component

Mutation testing is the developer's responsibility: you never write their mutation script,
install a tool, pick one for them, or store their command in a config file.

1. Read `CONTRIBUTING.md`, `.github/CONTRIBUTING.md` and `docs/CONTRIBUTING.md` when they
   exist. A mutation command written there (Stryker, PIT, mutmut, cosmic-ray, a project script)
   is a proposal: offer it as the first option of the question, with the folder it runs in.
2. Ask for each component its name, the folder its command runs in (`.` for the root) and the
   command. Without a proposal, ask the same question with no option filled in.
3. The command must write its scores as JSON to the file named by the `SKRAFT_MUTATION_RESULT`
   environment variable: `{ "scopes": [{ "name": "core", "score": 97.6, "survivors": ["src/Domain/Order.cs:12 Equality -> age > 18"] }, { "name": "boundary", "score": 85.7, "survivors": [] }] }`;
   `core` and `boundary` for a Clean Architecture component, one `global` scope for a single
   project. `survivors` is optional: one `file:line detail` line per surviving mutant, the file
   relative to the component root. `{baseSha}` in the command becomes `<base>`.

## 2. Alert on a full run

A command with no `--since`, `{baseSha}`, `delta`, `incremental` or diff option mutates every
line of the component. Before running it, alert the developer that the run is complete, not
incremental, and ask whether to run it as is or change it. The gate prints the same
`warning:` line at the top of its output.

## 3. Run

From the root of the working copy:

```bash
node "<skill>/scripts/mutation-gate/cli/mutation-gate.mjs" --root . --evidence .copilot-tracking/mutation --since "<base>" --run "<name>@<root>=<command>" [--run …]
```

`<skill>` is this skill's folder. `<base>` is the base of the work in progress:
`phaseHistory.DELIVER.baseSha` of the active pipeline when one is recorded, otherwise
`git merge-base HEAD <default branch>`. Drop `--since` when no command uses `{baseSha}`. One
`--run` per component, each quoted.

## 4. Report

Show the developer, from the gate's output:

- each scope's score and whether it meets the bar;
- the survivors, `file:line detail`, grouped by file; when the team reports none, say so and
  point to `.copilot-tracking/mutation/qg-mutation/<component>.log`;
- exit 2: the reason as the gate gives it.

The run never changes a delivery's G6: deliveries record it `not_run`.

Kill survivors only when the developer asks: load `mutation-testing`, which says how, and rerun
the same command.
