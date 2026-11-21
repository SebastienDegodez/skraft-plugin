---
name: skraft-init
description: Use when the developer runs /skraft-init mutation to set up mutation testing in skraft-config.json — the components, whether DELIVER runs the mutation gate or the developer runs /skraft-mutation, and each component's mutation command.
argument-hint: "[mutation]"
disable-model-invocation: true
---

# skraft init

You settle `skraft-config.json` with the developer, so that no run has to ask. This version
initialises **mutation** only. Without the `mutation` argument, or with another one, tell the
developer that `/skraft-init mutation` is the only part available here, and stop.

`<cli>` is `node "<skill>/scripts/init/cli/skraft-init.mjs"`, `<skill>` being this skill's
folder. Run it from the root of the working copy. It never overwrites what the file holds
except the values you pass it.

Ask every question below with the host's question tool (`AskUserQuestion` on Claude Code,
`ask_user` on Copilot), never by writing a line and reading the answer from the transcript.

## 1. The components

Run `<cli> components`. It lists one component per project it finds and adds the new ones to
`skraft-config.json`. Ask the developer only when it lists none, or one whose root surprises
you; edit the file by hand only for what the developer tells you.

## 2. In the pipeline or not

Ask once:

- **In the pipeline** — DELIVER runs the mutation gate on every story; a score below 80% blocks
  delivery.
- **Outside the pipeline** — DELIVER does not run it; the developer runs `/skraft-mutation` when
  they choose. DELIVER reuses that run when it judged the story's last commit on a clean
  working copy; otherwise the delivery says mutation was not run.

## 3. The mutation command, per component

Mutation testing is the developer's responsibility: you never write their mutation script,
install a tool or pick one for them. For each component, ask for the command that runs their
tool. Tell them what it must do:

- write its scores as JSON to the file named by the `SKRAFT_MUTATION_RESULT` environment
  variable: `{ "scopes": [{ "name": "core", "score": 97.6, "survivors": ["src/Domain/Order.cs:12 Equality -> age > 18"] }, { "name": "boundary", "score": 85.7, "survivors": [] }] }`;
- `core` and `boundary` for a Clean Architecture component, one `global` scope for a single
  project; every scope must reach 80%;
- `survivors` is optional: one `file:line detail` line per surviving mutant, the file relative
  to the component root; the team may leave it out;
- `{baseSha}` in the command becomes the base of the story, for an incremental run.

A component the developer gives no command for keeps none: say that the mutation gate does not
cover it.

## 4. Write

```bash
<cli> mutation --pipeline <true|false> --set <component>=<command> [--set <component>=<command>]...
```

One `--set` per component the developer gave a command for; quote each one. A refusal names
what to fix; nothing is written until it passes.

## 5. Before you stop

Tell the developer, in one line each: the components found, the mode chosen, each component's
command, and the components left without one. Suggest they run `/skraft-mutation` once now:
it proves the command writes what the gate reads.
