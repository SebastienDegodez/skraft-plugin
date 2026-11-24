---
title: "Run mutation on your branch"
description: "Declare each component's mutation command, then run mutation on your branch in your own session with the skraft-mutation skill and kill the survivors."
persona: software-engineer
---

# Run mutation on your branch

Mutation testing is yours: neither a story's pipeline nor the engine runs it. Declare the command
once, then run it on your branch when you choose, in your own session, with the `skraft-mutation`
skill.

## Prerequisites

- A `skraft-config.json` with its components ([Configure the components](./configure-components.md)).
- Your branch checked out.

## 1. Declare the mutation command of each component

Ask your agent for `/skraft-init mutation`, or write them yourself under `commands.mutation` of
each component in `skraft-config.json`. skraft holds no mutation command of any stack: the agent
proposes one per component, and you confirm or rewrite it. Nothing is installed: Stryker, PIT or
mutmut, and their configuration, are yours to add. To leave a component out, give it no
`mutation` key.

The command either writes its result, score already computed, to the file the environment
variable `SKRAFT_MUTATION_RESULT` names, or leaves the report its tool writes at the tool's
default path ([The mutation result](../reference/skraft-config.md#mutation-result)). The bar is
80 % for each scope.

## 2. Run the recipe

Ask your agent to run mutation on your branch: it loads the `skraft-mutation` skill. The recipe:

1. For each component with a `commands.mutation`, run the command in Bash from the component's root.
2. Read the report the command leaves.
3. Judge each scope (the core, the boundary) against the bar, on the files your branch changed
   since its merge base.
4. Kill the survivors with tests, then run the command again.

The engine runs none of this and journals nothing of it.

## 3. Read the verdict

A scope at the bar or above passes. Below it, the survivors of the changed files are the work left:
each one is killed by a test that fails on it, never by a test written for the mutant alone.

## Leave mutation out

Remove the `mutation` key of each component: the skill then has nothing to run and says so. To
change the workflow itself, eject it: [Eject the workflow](./eject-workflow.mdx).

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| The skill finds no mutation command | step 1 |
| The command's report cannot be read | check the path of the report, or have the command write `SKRAFT_MUTATION_RESULT` |
