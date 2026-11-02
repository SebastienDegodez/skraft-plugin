---
name: prune-tests
description: Use when the developer asks to prune redundant tests from a component or folder by running mutation testing with the full kill matrix, listing the tests and parameterized cases that kill no mutant on their own, and deleting, merging or keeping each one with the developer's approval.
disable-model-invocation: true
---

# Prune Tests

`<skill>` is the absolute path of the folder holding this SKILL.md; the script is in the
scripts/ folder next to this SKILL.md, never in the consumer repository.

Never delete, merge or rewrite a test without the developer's approval of that test. Never
edit production code except dead code the developer approved, and never in the `test:` commit.

## 1. Scope

Ask the developer for the scope: one `components[]` entry of `skraft-config.json` (its `root`,
`stack`, `paths.src`, `paths.tests`) or one folder. Pick the runner from the stack:

| Stack | Runner | Report the script reads |
|---|---|---|
| javascript, typescript, react | StrykerJS | `mutation.json` (mutation-testing-report-schema) |
| java | PIT (Maven or Gradle) | `mutations.xml` |
| any other | — | none |

Any other runner, or a report the script refuses as not a full kill matrix after the step 2
command line: tell the developer redundant tests cannot be proven for that component, and stop
for it.

## 2. Before run

From the component root, record the wall-clock duration of the run, the number of test
files and the number of fixture files under `paths.tests` (or the folder). Use the
component's installed tooling; never install a package.

- StrykerJS, with the component's Stryker config:
  `npx --no-install stryker run <config> --disableBail --coverageAnalysis perTest --force --reporters json,clear-text --mutate "<scope source glob>"`.
  Report: `reports/mutation/mutation.json`, unless the config sets `jsonReporter.fileName`.
  With `testRunner: 'tap'` a test is a test file.
- PIT Maven:
  `mvn org.pitest:pitest-maven:mutationCoverage -DfullMutationMatrix=true -DoutputFormats=XML -DtimestampedReports=false -DtargetClasses=<scope package>.*`.
  Report: `target/pit-reports/mutations.xml`.
- PIT Gradle: set `pitest { fullMutationMatrix = true; outputFormats = ['XML'] }` for the run,
  then `./gradlew pitest`. Report: `build/reports/pitest/mutations.xml`. Revert the build file
  change before committing.

Turn off PIT history reuse (`withHistory`) for both runs. Copy the report outside the report folder
(`before.json` / `before.xml`) before any further run overwrites it.

## 3. List

`node "<skill>/scripts/mutant-matrix.mjs" list --report <before report> --tests <scope test path>`
(add `--json` to parse). `<scope test path>` is each `paths.tests` entry or the folder, as the
report names test files (Stryker) or the test class package prefix (PIT); repeat `--tests` or
comma-separate. A `Warning:` line on stderr names a doubt to report to the developer.

Exit 2 prints one line: the report is refused. Fix the step 2 command line once and rerun; refused
again, tell the developer the line and stop for that component.

The output lists, each test once:

- tests covering no mutant (Stryker with `testFiles` only; with PIT, read the test sources
  for them);
- tests covering mutants but killing none;
- tests whose kills are all shared (`alone 0`);
- survived and no-coverage mutants as `file:line mutator`.

A PIT parameterized invocation (`[test-template-invocation:#n]`) is one test: propose on the
case, not the method.

## 4. Propose, one test at a time

Read each listed test and the mutants it covers. Propose exactly one action and wait for the
developer's decision before the next test:

| Action | When |
|---|---|
| delete | another test kills every mutant it kills, and it asserts no behaviour the others miss |
| merge | it differs from sibling tests only by input values: merge them with R3 (consolidate to parametrized test) of `test-refactoring-catalog` |
| keep | write the reason: the behaviour it guards that no mutator models, e.g. a guard against a missing normalisation |

Propose delete only when every mutant the test kills has a killer that is neither deleted nor
proposed for deletion.

Dead code: for each no-coverage or survived mutant no test can reach through the public
behaviour, and each branch only a test bypassing the acceptance entry point reaches, propose
deleting that code. The developer decides each one.

Apply only approved test deletions and merges; approved dead code waits for step 5.

## 5. Prove and commit

Rerun the step 2 command line unchanged, record the same three numbers, copy the report to
`after.*`, then:

`node "<skill>/scripts/mutant-matrix.mjs" compare --before <before report> --after <after report>`

- Exit 1 lists each `lost:` kill or `gone:` mutant. Restore the deleted or merged test that
  killed it in the before report, rerun, compare again. Never commit while exit is not 0.
- Exit 0: run the component's `test` command, then make one commit `test: prune redundant
  tests in <scope>` holding only test and fixture changes.
- Delete approved dead code after that commit, run the `test` command, commit it separately
  as `refactor: remove dead code in <scope>`.

End the final answer with the before/after report:

| | Before | After |
|---|---|---|
| Tests (compare output) | | |
| Test files | | |
| Fixture files | | |
| Mutation run duration | | |
| Killed mutants | | |

Then list each test deleted, merged or kept with its reason, and each dead-code proposal with
the developer's decision.
