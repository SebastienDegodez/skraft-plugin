---
name: skraft-init
description: Use when the developer asks to initialise skraft in a working copy, when a run refuses to start because the configuration is incomplete, or when the developer asks to set up mutation testing (`/skraft-init mutation`). Detects the components, then settles with the developer the base branch, the gate commands, the publication consents, BDD per component and the model choice, and writes them to skraft-config.json so that no run has to ask; with the argument `mutation`, declares only each component's mutation command.
---

# skraft init

You settle `skraft-config.json` with the developer, once, so that a run starts on `research` and
asks nothing. Ask every question in this file; never guess an answer you could ask for.

Called with the argument `mutation`, do the section *Mutation* alone, then stop.

When the host lists the skraft MCP tools, use them instead of `<cli>`: `skraft_init` for
`<cli> init` (`{ add: [<folder>, …] }` for `--add`), `skraft_doctor` for `<cli> doctor`
(`{ run: true }` for `--run`). Pass `workspace`, the absolute path of the root of the working
copy, to every skraft tool call. When a skraft tool refuses, tell the developer its refusal and
stop: never run `<cli>` or any `node` command in its place. Only when the host lists no skraft
tool, `<cli>` below is
`node "<plugin folder>/engine/drivers/cli/skraft.mjs"`, the plugin folder being the one this skill
sits in. Run it from the root of the working copy. Never type `skraft`: the developer may, you do
not, and never search the disk for the plugin folder.

## 1. The components

Run `<cli> init`. It writes each project's name, root, stack and paths to `skraft-config.json`,
with no command; it never overwrites a value the file already holds.

A folder it missed is added with `<cli> init --add <folder>`, one `--add` per folder. Ask the
developer only when the result lists no component, or lists one whose root surprises you.

## 2. The base branch

Read the repository's default branch from Git, never assume `main`. When `baseBranch` already
names another ref, leave it: the developer chose it.

## 3. The gate commands

For each component, `commands` must hold at least one of `build`, `format`, `lint`, `test`,
`architecture`, `coverage`, `e2e`; a component with none can prove nothing and the gates refuse
the run. `mutation` counts for none of them: ask nothing about it here, *Mutation* declares it.

`<cli> init` writes no command: every command is the developer's. For each component, load its
stack's `quality-gates-<stack>` skill when one exists, and propose the lines of its *Gate command
lines* table that this working copy can run (a script its manifest declares before a tool it
implies; the project's `./mvnw` or `./gradlew` before the global tool). Write the interpreter a
Python line needs as this machine needs it (`.venv/bin/python …`, `.venv\Scripts\python.exe …`):
the engine starts a program as written. Two commands no table gives:

- `architecture` — the command that runs the architecture tests. Look for them in the working
  copy (a test project or folder whose name holds `architecture` or `arch`, a NetArchTest,
  ArchUnit, ts-arch or import-linter dependency). Found: propose the command that runs them
  alone. Not found: leave the key out and say so; architecture is then not one of that
  component's gates, and nothing checks its boundaries.
- `e2e` — the end-to-end command, for a front end only.

Propose each command and have the developer confirm it. A command the developer writes always
wins. A command runs with no shell, the same under sh, PowerShell and cmd: a pipe, a redirection,
`&&` or a `VAR=value` before the program is refused. A command that needs variables or several
steps is a script of the component, and the command calls the script. Then run `<cli> doctor --run` and fix every failure before you go on: a command that does
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

The engine has already looked. Each component of the Configuration view carries two lists, and you
read them instead of searching the disk yourself: `bddPaths`, the pairs its file names — empty when
the file names none, since no stack decides them — and `bddFound`, the pairs the working copy
actually holds, one per test project whose manifest names a BDD runner and whose folders hold both
the `.feature` files and the bindings.

Leave no component undecided: a component whose `bdd` says nothing, or says a bare `true`, refuses
every run with `skraft is not initialised`, and `skraft doctor` fails on it.

- **`bddFound` is not empty**: show those pairs, one line per pair, and ask the developer to confirm
  them. Write them as `bdd` on a yes, and write a pair they correct as they give it. Say when they
  differ from `bddPaths`, because that is the case where the file is wrong and nobody noticed.
- **`bddFound` is empty and a test project names a BDD runner or holds a `.feature`**: the engine
  found one half only. Ask where both folders are and write the pair. Never guess the missing one:
  a folder the runner does not read holds scenarios nothing runs.
- **Neither, and the component says nothing or `true`**: ask whether it describes its behaviour in
  Gherkin. Declining writes `"bdd": false`. Accepting means naming the folders: ask for them and
  write the pair. Never invent a folder from the stack — one nobody chose is one the runner may
  never read, and a component holding several test projects would get a pair belonging to none of
  them. This is the question a run is refused for until it is answered.
- **The component writes Gherkin and runs none of it**: write the pair with `features` only. The
  scenarios live there as the story's specification, and nothing is asked of them.

One pair per runner: a definition of one pair binds no step of another, so a component holding
several test projects carries several pairs.

A pair is `{ "runner": "<runner>", "features": "<folder>", "steps": "<folder>" }`, both folders
relative to the component root and inside it; `runner` may be left out, and `steps` too when
nothing binds the scenarios. `bdd` is a list of pairs, or `false`.

For new layouts, use `clean-architecture-testing`: executable scenarios and bindings belong
to the unit-test suite, grouped by feature; integration tests, including the walking skeleton,
use ordinary test code. Specification-only files use `docs/features/<context>/<feature>/`
and a `features`-only entry. Never move an existing confirmed pair automatically.

Before confirming an executable pair, check the runner's actual discovery configuration and
run the selected scenarios with the developer's command:

- Cucumber-JVM: classpath resource selector, Java glue package and discoverable JUnit runner;
  a filesystem `steps` folder is not glue configuration.
- pytest-bdd: collected `test_*.py` modules bind scenarios, and decorated steps are fixtures
  in those modules, applicable `conftest.py` files or explicitly registered plugins. A
  `steps` folder alone is not discovered.
- behave: each selected feature root has its own `steps/` directory; pytest does not run it.
  A wrapper command must invoke each independent behave root and propagate failures.

Require executed scenario counts and resolved bindings, not just a successful process exit.
Detection is a folder-name proposal, never proof that a runner executes those files.

Every component leaves this step with a `bdd` list or `"bdd": false`, never with an absent key and
never with a bare `true`: either of those is the state a run is refused for.

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
- anything you left out, and what it costs them;
- that `/skraft-init mutation` declares their mutation testing, when no component has a
  `mutation` command;
- that `npm i -g @skraft/cli` gives them `skraft` for their own terminal, when it answers nothing
  today. Never install it yourself, and keep using `<cli>`: the long line needs no install.

## Mutation

Mutation testing is the developer's: no run of the pipeline mutates, and nothing is declared
until they ask for it.

1. For each component that has no `mutation` command, propose one from its stack's
   `quality-gates-<stack>` skill and the tool the working copy declares; keep a command already
   written. When you know no command that writes a report the engine reads, propose one that
   writes `SKRAFT_MUTATION_RESULT`.
2. Show each component's `mutation` command, one line each, and ask the developer to confirm it,
   rewrite it, or leave the component out. Write each confirmed line yourself into
   `commands.mutation` of the component in `skraft-config.json`; a component left out gets no
   `mutation` key and nothing else.
3. Install nothing and write no configuration of the tool (Stryker, PIT, mutmut): no scaffold.
   Name what the command needs that the working copy lacks (the tool, its plugin, its
   configuration file) and leave it to the developer.
4. A command the developer writes either writes its result, score already computed, to the file
   the environment variable `SKRAFT_MUTATION_RESULT` names, or leaves the report its tool writes
   at the tool's default path. `skraft-quality-bar` gives the result's form and the bar.
5. Run `<cli> doctor`. Its `mutation` line names the components that declare a command; fix every
   `<component>/mutation` failure. Then tell the developer that `skraft mutation` runs mutation on
   the branch HEAD is on, in its own run.
