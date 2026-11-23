---
name: quality-gates-javascript
description: Use in a JavaScript/Node.js project when running its existing package tests or build scripts, or when judging whether a recorded JavaScript test result is enough to call delivery verified. Owns command resolution from checked-in package scripts and fresh evidence capture. Mutation (G6) never runs in a delivery: it is the developer's, through /skraft-mutation. Not for explaining test code, TypeScript or Vitest packages (quality-gates-typescript), or coverage enforcement.
---

# JavaScript quality gates

Load quality bar (`skraft-quality-bar`) and
evidence contract (`quality-gates-evidence-contract`).
Missing tooling, unsupported scope, failed gates or absent evidence block delivery.

## Resolve ordinary commands first

- Read checked-in package scripts in the explicitly selected package. Use its
  `test`, `build`, `typecheck`, `lint` or dedicated acceptance/architecture scripts
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
  Write G9 snapshots of each scenario's acceptance test at its `test` and green commits with `node "<skill>/scripts/snapshot.mjs" --evidence <dir> --name red-1-<file> --rev <commit> --file <path>`.
  `<skill>` is this skill's folder, the one holding this SKILL.md.
- G11 line coverage is **not implemented** here. Native Node coverage may aid
  diagnosis but is not an enforced scoped coverage gate. Report blocker, not pass.

## G6 — Mutation score

Never run in a delivery. This adapter runs no mutation tool or gate and ships no mutation
config: record G6 `not_run` with the rationale `G6 not run: mutation testing runs outside the
pipeline; the developer runs /skraft-mutation.`, never `pass`, and tell the developer.

## Evidence

- Verify an assembled evidence log with `node "<skill>/scripts/qg-verify/cli/qg-verify.mjs" --log <qg-{story}.json>`.
- Never invent new gate IDs or claim all quality gates passed. Git revision alone does not
  attest a dirty tree.
- No browser/frontend mapping, TypeScript transpilation, test installation, coverage gate or
  automatic commit/push.
