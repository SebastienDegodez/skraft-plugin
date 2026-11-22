---
name: skraft-mutation
description: Use when the developer asks to run mutation testing on their branch, to kill the mutants that survive, or to check the mutation bar before they open a pull request. A recipe of the developer's own session, run in Bash with the component's mutation command - run it on the files the branch changed, judge each scope against the bar, kill the survivors with tests. Not for declaring the mutation commands (skraft-init with the argument mutation), nor for a story's pipeline, which runs no mutation.
---

# skraft mutation

skraft's engine runs no mutation, and `skraft_repl` is closed outside an agent's attempt: this
recipe is yours, in the developer's session, with `Bash`. Nothing here is traced or checked by
the engine; the developer reads the verdict you report.

## 1. What to mutate

1. Read `skraft-config.json`: each component's `root` and its `commands.mutation`. A component with
   none is left out, and you say so: `/skraft-init mutation` declares it. No component with one:
   stop.
2. The base is the merge base of the branch HEAD is on with the component's `baseBranch`, else
   `main`: `git merge-base HEAD <base>`. A detached HEAD: ask the developer which branch to
   mutate, and stop.
3. Replace `{baseSha}` in the command by that base. Run the command from the component's root,
   in `Bash`, with a timeout the developer's project can bear; keep what it prints in a file
   under the scratch folder you were given, and read that file, never the stream.

## 2. The score

Read the report at the path of the tool, relative to the component root, or the result the
command writes to the file `SKRAFT_MUTATION_RESULT` names (set that variable to a file in your
scratch folder; its form is in `skraft-quality-bar`).

| Tool | Report |
|---|---|
| Stryker.NET | `StrykerOutput/reports/mutation-report.json` |
| PIT, Maven | `target/pit-reports/mutations.xml` |
| PIT, Gradle | `build/reports/pitest/mutations.xml` |
| StrykerJS | `reports/mutation/mutation.json` |

Count only the mutants in files the branch changed (`git diff --name-only <base>...HEAD`).
A file under a folder whose name ends with the word `domain` or `application` is core; any other
file is boundary. The bar is the one of `skraft-quality-bar`, per scope: score = killed /
(killed + survived), as a percent rounded down. A report you cannot read, or a command that
did not run, is a failure of the environment: say what is missing and stop; a gate that cannot
run is not a passed gate.

## 3. The survivors

For each surviving mutant of a changed file, in the order of the report:

- a behaviour no test asserts: write the failing test first (`outside-in-tdd`), commit it as
  `test(<story>): …`; the test passes on the code as it is, since the mutant is the code that is
  wrong;
- code no behaviour asks for: delete it in a `refactor(<story>): …` commit;
- a mutant no test can tell apart from the code: change nothing, and name it in your report,
  `<file>:<line>` and why.

Run the command again after each batch of tests, until every scope meets the bar or the same
mutants survive two rounds in a row: then stop and tell the developer which ones and why. Never
lower a threshold, edit the tool's configuration to exclude a file, or add a suppression.

## 4. The report

Say, per component and scope: the score against the bar, the survivors that remain, each as
`<file>:<line>`, and the commits you made. A scope under the bar is a failure; say so plainly.
