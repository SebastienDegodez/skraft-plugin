---
name: quality-gates-javascript
description: "Use in a JavaScript/Node.js project when running its existing package tests or build scripts, or when judging whether a recorded JavaScript test result is enough to call delivery verified. Owns command resolution from checked-in package scripts and recording each gate's verdict. Architecture, coverage and mutation never run in a delivery: the project's CI runs them. Not for explaining test code, TypeScript or Vitest packages (quality-gates-typescript), or coverage enforcement."
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
- Run each gate command at execution time through the bundled
  `node "<skill>/scripts/capture.mjs" --log <dir>/qg-{story}.json --gate test.acceptance,test.unit -- npm --prefix <package> run test`:
  it runs without a shell, prints the last 40 lines and records the gate(s) in the log from the
  exit code (`pass` on 0, `fail` otherwise). No `.stdout`, `.exit` or hash file is written.
  `<skill>` is this skill's folder, the one holding this SKILL.md. `<dir>` is the story's
  Git-ignored evidence directory (the script refuses one Git tracks); nothing in it is committed.
- A gate that genuinely does not apply is recorded with
  `node "<skill>/scripts/gate-log.mjs" --log <dir>/qg-{story}.json --not-applicable <gate> --rationale "<why>"`,
  screenshots with `--screenshot <png>`. Never edit the log by hand.
- `commit.convention` and `test.integrity` are not recorded: `qg-verify` reads the commits and
  the RED acceptance tests from Git.

## Not run by this adapter

Architecture, coverage and mutation are not pipeline gates: the project's CI runs coverage and
mutation, the developer runs `/skraft-mutation` by hand. Never record `G5`, `G6`, `G11` nor any
`arch.*` / `ci.*` id in a log.

## Evidence

- Verify the evidence log with `node "<skill>/scripts/qg-verify/cli/qg-verify.mjs" --log <qg-{story}.json>`.
- Use the v7 ids of `quality-gates-evidence-contract` (`test.acceptance`, `test.unit`,
  `build.compile`, `build.lint`, `test.no-mocks-core`, `evidence.screenshots`). Never invent new gate IDs or claim all quality gates passed. Git revision alone does not
  attest a dirty tree.
- No TypeScript transpilation, test installation, coverage gate or automatic commit/push.
  A frontend story's screenshots come from `playwright-evidence`.
