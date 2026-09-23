---
name: quality-gates-javascript
description: Use when resolving JavaScript test/build commands or running Node TAP mutation gates after a green baseline. Owns sequential core/boundary StrykerJS execution and fresh evidence. Supports installed StrykerJS 9.6.1 with TAP only; not frontend, TypeScript compilation, coverage enforcement, or other mutation runners.
---

# JavaScript quality gates

Load [quality bar](../skraft-quality-bar/SKILL.md) and
[evidence contract](../quality-gates-evidence-contract/SKILL.md).
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
- Capture ordinary commands' stdout, stderr and exit codes at execution time.
  This runner captures mutation only, not G1-G5, G7-G11 or RED evidence.
- G11 line coverage is **not implemented** here. Native Node coverage may aid
  diagnosis but is not an enforced scoped coverage gate. Report blocker, not pass.

## Inputs

Consumer owns two durable, checked-in `.json` or `.mjs` Stryker configs. Both must
exist in HEAD and index; working-tree edits are hashed, not silently discarded.
Review approved source inventory before running. Config selection cannot prove
that user omitted no relevant source. Include adapter policy in core and adapter
I/O runner in boundary when validating changes to this adapter itself.

- Require explicit positive root-relative `mutate` patterns and
  `tap.testFiles`. Every pattern must resolve; scopes must not overlap.
- Require `testRunner: 'tap'`, a `json` reporter and all three `thresholds`
  (`high`, `low`, `break`) equal to the quality bar's value for that scope.
- Supported source extensions: `.js`, `.mjs`, `.cjs`; each scoped file must
  produce at least one mutant. Mutation-free files block rather than disappear.
- Supported optional settings: `coverageAnalysis`, positive numeric `concurrency`,
  `timeoutMS`, `timeoutFactor`, `dryRunTimeoutMinutes`, `maxTestRunnerReuse`,
  boolean `disableBail`, `logLevel`; local `clear-text`/`progress` reporters.
- TAP accepts `testFiles`, boolean `forceBail`, and `nodeArgs` containing only
  `--test-reporter=tap` / `--test-reporter-destination=stdout`.
- Reject other options, negative/range patterns, global exclusions, source
  suppression directives, incremental reuse, custom plugins/checkers, build
  commands and test-name filters. No scaffold or config rewrite is performed.
- `.mjs` configs are trusted executable project code. Their resolved options are
  captured in JSON; imported config dependencies are not individually hashed.
- `--package` selects local module resolution. Package must declare and already
  have `@stryker-mutator/core` and `@stryker-mutator/tap-runner` 9.6.1 available.
  Node >=20 required. Other versions/runners block pending compatibility work.

## Single mutation entry point

Run bundled [runner](scripts/run-gates.mjs) with:

```text
node "$SKRAFT_PLUGIN_ROOT/skills/quality-gates-javascript/scripts/run-gates.mjs" --root <repo> --package <package-dir> --core <core-config> --boundary <boundary-config> --evidence <directory>
```

For a PR differential run, add `--since <base-ref>`. The runner resolves the Git
merge-base, records it in the manifest, and mutates changed files that belong to each
durable scope. A differential score is not a full-repository score. For local diagnosis,
add one or more `--overlay <json-config>` arguments; overlays apply in order and cannot
change `mutate`, test selection, thresholds, reporters, or report paths. CI must use the
checked-in configs without overlays.

Paths resolve from `--root`, except `--root` itself. Core executes before boundary;
core failure stops sequence. A full rerun always reruns core. Never invoke raw
Stryker as a substitute. No previous report or receipt is an input.

`--core-only` permits omitting `--boundary` for debugging. Successful debug result
is `status: core-only`, `combinedPass: false`; never use it as combined G6 proof.

Runner resolves local Stryker CLI and invokes Node with `run <fresh-config.json>`.
Verified native options: `thresholds.break`, `jsonReporter.fileName`, `plugins`.
No .NET `--break-at` or invented reuse flags. Native score counts `Timeout` as
detected; this narrow adapter rejects Ignored, CompileError and RuntimeError
rather than silently shrinking denominator.

## Result and evidence

- Exit 0: full mutation pass, or explicitly labelled core-only debug success.
- Exit 1: failed child/report/score or source changed during execution.
- Exit 2: invalid input, unsupported tooling/config or evidence I/O failure.
- JSON stdout supplies verdict, `combinedPass`, gate records and manifest path.
  Only full `status: pass` plus exit 0 qualifies as combined mutation proof.
- Each invocation allocates a unique evidence directory. Per scope: effective
  config, native report, stdout/stderr, child exit and adapter gate exit.
  Manifest captures SHA-256 hashes, command argv, timings, source/test hashes,
  original config path/hash, Node/tool versions and starting Git revision.
- Both child exit and adapter gate exit must succeed. A zero child exit without
  a valid fresh report is failure. Reject malformed/empty reports, wrong root,
  config/report-path mismatch, changed sources, unexpected files/statuses and
  symlink reports. Source/test/config edits during execution block.
- Manifest is supporting G6 evidence, not a replacement v3 evidence log. Producer
  references both scope records from existing contract; never invent new gate IDs
  or claim all quality gates passed. Git revision alone does not attest dirty tree.
- No browser/frontend mapping, TypeScript transpilation, test installation,
  equivalence-suppression support, coverage gate or automatic commit/push.