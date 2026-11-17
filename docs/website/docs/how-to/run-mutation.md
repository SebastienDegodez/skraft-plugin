---
title: "Run mutation on your branch"
description: "Declare each component's mutation command, run mutation on your branch apart from any story, kill the survivors, read the verdict, or leave mutation out."
persona: software-engineer
---

# Run mutation on your branch

Mutation testing is yours: no story's pipeline mutates. Declare the command once, run it on your
branch when you choose, and let skraft hand the surviving mutants to agents that propose and write
the tests that kill them.

## Prerequisites

- A `skraft-config.json` with its components ([Configure the components](./configure-components.md)).
- Your branch checked out: a mutation run is the run of the branch HEAD is on.
- A terminal at the root of the working copy; `skraft` is the command that [`npm i -g @skraft/cli`](./install-on-a-host.mdx#skraft-command) sets up; the long line `node "<plugin folder>/engine/drivers/cli/skraft.mjs"` works without it.

## 1. Declare the mutation command of each component

Ask your agent for `/skraft-init mutation`, or write them yourself:

```console
$ skraft init --mutation
skraft-config.json already lists every project found (2 components); mutation: api, web
```

It writes the command of each stack ([the defaults](../reference/skraft-config.md)) to the
components that have none, and keeps a command you wrote. It installs nothing: Stryker, PIT or
mutmut, and their configuration, are yours to add. To leave a component out, remove its
`mutation` key.

The command either writes its result, score already computed, to the file the environment
variable `SKRAFT_MUTATION_RESULT` names, or leaves the report its tool writes at the tool's
default path ([The mutation result](../reference/skraft-config.md#mutation-result)). The bar is
80 % for each scope.

## 2. Run mutation on your branch

From your agent: `/skraft-mutation`. From a terminal:

```console
$ skraft mutation
```

The run lives in `.copilot-tracking/skraft-mutation/<branch>/`, apart from any pipeline. Each
component's command runs against its merge base, uncommitted changes included. A scope at the bar
or above ends the run there.

## 3. Kill the survivors

Below the bar, the run hands one proposal agent per file of survivors over (`dispatch`). The
agent your host conducts starts them and saves their replies, then:

```console
$ skraft mutation record
```

The run then asks you for the plan (`mutation-plan`). Your agent asks it in the chat and relays
your reply with the `skraft_mutation` tool; from a terminal, answer it yourself:

```console
$ skraft mutation decide APPLY
```

`APPLY` has the proposals written as tests, reviewed, gated, then mutated again; an instruction in
quotes replaces them; `STOP` ends the run. Run `skraft mutation` again to go on.

## 4. Read the verdict

```console
$ skraft doctor
ok    mutation: api, web declare a mutation command; last run on feat/refund: mutation passed (core 86 %, boundary 92 %), ended
```

A failed verdict is a warning, never a failure. The next `skraft mutation` starts afresh on the
code as it stands.

## Leave mutation out

Remove the `mutation` key of each component: `skraft mutation` then refuses with
`no-mutation-command`, and doctor says that no component declares one. To change the workflow
itself, eject it: [Eject the workflow](./eject-workflow.mdx).

## Troubleshooting

| Refusal | What to do |
| --- | --- |
| `detached-head` | check out the branch to mutate, then run again |
| `no-mutation-command` | step 1 |
| `refused (not-recorded)` | start the agents listed, save their replies, then `skraft mutation record` |
| `environment` on the mutation gate | the command did not run or its result cannot be read: the reason names the file; fix the command, check it with `skraft doctor` |
