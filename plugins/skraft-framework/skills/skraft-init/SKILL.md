---
name: skraft-init
description: Use when the developer asks to initialise skraft in a working copy, or when a run refuses to start because the configuration is incomplete. Detects the components, then settles with the developer the base branch, the gate commands, the publication consents, BDD per component and the model choice, and writes them to skraft-config.json so that no run has to ask.
---

# skraft init

You settle `skraft-config.json` with the developer, once, so that a run starts on `research` and
asks nothing. Ask every question in this file; never guess an answer you could ask for.

When the host lists the skraft MCP tools, use them instead of `<cli>`: `skraft_init` for
`<cli> init` (`{ add: [<folder>, …] }` for `--add`), `skraft_doctor` for `<cli> doctor`
(`{ run: true }` for `--run`). Otherwise, `<cli>` below is
`node "<plugin folder>/engine/drivers/cli/skraft.mjs"`, the plugin folder being the one this skill
sits in. Run it from the root of the working copy. Never type `skraft`: the developer may, you do
not, and never search the disk for the plugin folder.

## 1. The components

Run `<cli> init`. It detects each project folder and writes `skraft-config.json`; it never
overwrites a value the file already holds.

A folder it missed is added with `<cli> init --add <folder>`, one `--add` per folder. Ask the
developer only when the result lists no component, or lists one whose root surprises you.

## 2. The base branch

Read the repository's default branch from Git, never assume `main`. When `baseBranch` already
names another ref, leave it: the developer chose it.

## 3. The gate commands

For each component, `commands` must hold at least one of `build`, `format`, `lint`, `test`,
`architecture`, `coverage`, `mutation`, `e2e`; a component with none can prove nothing and the
gates refuse the run.

`<cli> init` fills the commands of the stack it detected. Two it cannot detect:

- `architecture` — the command that runs the architecture tests. Look for them in the working
  copy (a test project or folder whose name holds `architecture` or `arch`, a NetArchTest,
  ArchUnit, ts-arch or import-linter dependency). Found: propose the command that runs them
  alone. Not found: leave the key out and say so; architecture is then not one of that
  component's gates, and nothing checks its boundaries.
- `e2e` — the end-to-end command, for a front end only.

Propose each command and have the developer confirm it. A command the developer writes always
wins. Then run `<cli> doctor --run` and fix every failure before you go on: a command that does
not run is worse than an absent one.

## 4. The two publication consents

Ask each one with the host's question tool (`AskUserQuestion` on Claude Code, `ask_user` on
Copilot), never by writing a line and reading the answer from the transcript. Record an answer
only once the tool returns it.

Ask each one in these words, which are the ones the answer is kept against:

- `publish.pullRequest` — *May skraft push this branch and open or update its pull request when a
  run ends, and keep one comment on its story's issue up to date with the run's progress, time and
  cost?*
- `publish.visuals` — *May skraft publish the screenshots and videos of its runs in the pull
  request of the branch? They can show private data.*

Ask `visuals` only when a component is a front end (a `react` stack, or an `e2e` command).

Write each answer with the version of the question it answers, under `publish.questionVersions`:
`pullRequest` is at version 2, `visuals` at version 1. An answer kept against an earlier version
is not settled, and a run is refused until you ask again.

A refusal is an answer: a run then publishes nothing and is not held up.

## 5. BDD, per component

Ask each component whether it describes its behaviour in Gherkin. Propose the answer from what you
find, and say what you found:

- `.feature` files under `docs/features/` or under the component's test paths;
- a BDD runner in its `test` command or its manifest (Reqnroll, SpecFlow, Cucumber, behave,
  pytest-bdd, jest-cucumber).

Found either: propose yes. Found neither: propose no.

Write `"bdd": false` only when the developer declines. An absent key already means yes, and the
file stays as short as it can be.

Declining asks DISTILL for no `.feature`: the acceptance designer takes its scenarios from the test
plan's `Scenario` column, and TDD runs as it always does. Accepting holds the component to its
scenarios in full; it is not a bar that can be lowered later.

## 6. The models

Ask the developer to choose:

- **standard** — the plugin's tiers decide. Write nothing. This is the answer on Claude Code
  unless the developer asks otherwise.
- **explicit** — each tier (`economy`, `standard`, `frontier`, `premium`) names the model it runs
  on, per host. Useful on Copilot, where a host offers its own list. Ask whether the choice is the
  team's (`skraft-config.json`) or personal (`skraft-config.local.json`, which Git ignores).

Never write a model name the developer did not choose.

## 7. Before you stop

Run `<cli> doctor`. It refuses an invalid file and names every error; fix each one and run it
again. Then tell the developer, in one line each:

- which components were detected, with the gates each one can run;
- what you wrote, and which file;
- anything you left out, and what it costs them.
