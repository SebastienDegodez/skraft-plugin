---
name: quality-gates-javascript
description: "Use in a JavaScript/Node.js project when running its existing package tests or build scripts, or when judging whether a recorded JavaScript test result is enough to call delivery verified. Owns command resolution from checked-in package scripts and fresh evidence capture. Architecture, coverage and mutation never run in a delivery: the project's CI runs them. Not for explaining test code, TypeScript or Vitest packages (quality-gates-typescript), or coverage enforcement."
---

# JavaScript quality gates

Load quality bar (`skraft-quality-bar`) and
evidence contract (`quality-gates-evidence-contract`).
Missing tooling, unsupported scope, failed gates or absent evidence block delivery.

## Resolve ordinary commands first

- Read checked-in package scripts in the explicitly selected package. Use its
  `test`, `build`, `typecheck`, `lint` or dedicated acceptance scripts
  only when present and applicable; preserve their working-directory semantics.
- Invoke `npm --prefix <package> run <script>` for a verified script. Never use
  `npx`, install packages, or treat an absent script as a successful gate.
- Native Node test suites may use `node --test <explicit test paths>` from repo
  root. For this adapter's authoring bootstrap, use
  `node --test tests/skraft-framework/quality-gates/quality-gates-javascript-*.test.mjs`.
- Plain no-emit JavaScript has no compilation step: `node --check <source>` checks
  syntax only. Do not label it TypeScript compilation or architecture validation.
- Capture ordinary commands at execution time with the bundled
  `node "<skill>/scripts/capture.mjs" --evidence <dir> --name qg-tests -- npm --prefix <package> run test`:
  it runs without a shell and writes `<name>.stdout`, `<name>.exit` and `<name>.stdout.sha256`.
  `<skill>` is this skill's folder, the one holding this SKILL.md. `<dir>` is the story's
  Git-ignored evidence directory: `git check-ignore -q <dir>` must succeed; nothing in it is committed.
- `test.integrity` needs no snapshot: record each scenario's acceptance test file with its
  `test` and green commits; `qg-verify` reads both with `git show`.

## Not run by this adapter

Architecture, coverage and mutation are not pipeline gates: the project's CI runs coverage and
mutation, the developer runs `/skraft-mutation` by hand. Never record `G5`, `G6`, `G11` nor any
`arch.*` / `ci.*` id in a log.

## Evidence

- Verify an assembled evidence log with `node "<skill>/scripts/qg-verify/cli/qg-verify.mjs" --log <qg-{story}.json>`.
- Use the v7 ids of `quality-gates-evidence-contract` (`test.acceptance`, `test.unit`,
  `build.compile`, `build.lint`, `test.no-mocks-core`, `commit.convention`, `test.integrity`,
  `evidence.screenshots`). Never invent new gate IDs or claim all quality gates passed. Git revision alone does not
  attest a dirty tree.
- No TypeScript transpilation, test installation, coverage gate or automatic commit/push.
  A frontend story's screenshots come from `playwright-evidence`.
