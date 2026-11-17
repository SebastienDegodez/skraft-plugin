---
name: skraft-mutation
description: Use when the developer asks to run mutation testing on their branch, to kill the mutants that survive, or to check the mutation bar before they open a pull request. Conducts skraft's mutation run of the branch HEAD is on - starts the agents it hands over, relays the developer's choice of plan, and reports the verdict. Not for declaring the mutation commands (skraft-init with the argument mutation), nor for a story's pipeline, which runs no mutation.
---

# skraft mutation

The skraft engine runs the mutation workflow on the branch HEAD is on and decides every step. You
start the agents it hands over and relay what it reports.

When the host lists the skraft MCP tool `skraft_mutation`, call it instead of `<cli>`:
`skraft_mutation {}` for `<cli> mutation --json`. Otherwise `<cli>` is
`node "<plugin folder>/engine/drivers/cli/skraft.mjs"`, the plugin folder being the one this
skill sits in; run it from the root of the working copy. Never type `skraft`, and never search
the disk for the plugin folder.

1. Run `<cli> mutation --json`. Each answer is the JSON of a step; `then` is what to run once
   the step is done.
2. Act on the status of the step, and only on it:
   - `dispatch`, or `refused` with code `not-recorded`: for each listed agent, one after the
     other, start that custom agent as a subagent with exactly its `prompt`, on its `model` when
     the subagent tool takes one; write the subagent's final message, unchanged, to its `reply`
     file. Then run `then` and act on its answer.
   - `waiting`: the reason holds the question, its options, and how its reply is relayed. Ask
     the EXACT question and options with the host's native question tool (`AskUserQuestion` on
     Claude Code, `ask_user` or `askQuestions` on Copilot); ask for a reason when the developer
     refuses. Relay ONLY their reply as the reason says: `skraft_mutation` with its `key` and
     `answer` (and `reason`), or the line the developer runs in their own terminal, with
     `--reason "<reason>"` when they gave one; then run `then`. Missing native tool or
     dismissal: say so, and record nothing.
   - `done`: run `<cli> doctor --json` and relay the `detail` of its `mutation` check: each
     scope's score against the bar.
   - `refused` with code `no-mutation-command`: point to `/skraft-init mutation` and stop.
   - `refused` with code `detached-head`: ask the developer to check out the branch to mutate,
     and stop.
   - `blocked` or any other `refused`: relay the status, the code and the reason, and stop.

Start an agent only as a `dispatch` step lists it. Never run the mutation tool, a gate, or a
skraft command no step names, and never write or edit a file under `.copilot-tracking/` other
than a `reply` file the current step lists.
