# skraft-docs-orchestrator — agent suite (DISABLED)

Migrated from the GENESIS evals removed by `97705d8` *feat(evals): adopt vally evaluation
pipeline*:

| GENESIS source | Landed as |
|---|---|
| `evals/skraft-docs-orchestrator/content.yml` — 3 fixtures | [`eval.yaml`](eval.yaml) — 3 stimuli |
| `evals/skraft-docs-orchestrator/triggers.yml` — 18 triggers | [`triggers.yml`](triggers.yml) — preserved, not executed |

Same translation rules as the two worker suites, with one difference that matters: this agent
**dispatches**. The executor supports that through `tags.subagents`, which registers the named
specialists as dispatchable custom agents and publishes `subagentDispatchCount` /
`dispatchedSubagents` as run metrics — so a run that narrated a fan-out it never performed is
distinguishable from one that actually spawned workers.

## The fixtures are verified, not asserted

The GENESIS eval described each starting state in prose (`seed_context`). Here each one is a real
mini-handbook, and the real `scripts/scan-drift.mjs` and `scripts/lint-nav.mjs` were run against
it to confirm the drift the stimulus starts from:

| Fixture | Verified starting state |
|---|---|
| `handbook-with-orphan-worker/` | `scan-drift` → exactly 1 item: `missing-page` / `workers-mock-integration-worker`, `lang: both`, severity `high`. `lint-nav` clean. |
| `handbook-missing-diataxis-mode/` | `lint-nav` → exactly 1 problem: `NAV-MODE-MISSING` on `parts[0]`, exit 1. `scan-drift` → exactly 1 item: `missing-diataxis-mode`. |
| `handbook-missing-editorial-page/` | `scan-drift` → exactly 1 item: `missing-page` / `for-executives`, `pageType: editorial`. `lint-nav` clean. |

That is why the graders can afford to be exit-code assertions on the same two scripts: the
before-state is known exactly, so "scans clean afterwards" is a real repair and not a tautology.

## The toolchain is staged from the repository, not copied

`environment.files` reaches out of the suite with `src: ../../../scripts/scan-drift.mjs` and
friends. That is deliberate — a copied scanner would drift from the shipped one and the eval
would start grading a fiction. Four files plus one dependency are staged:
`scripts/{scan-drift,lint-nav,check-citations}.mjs`, `scripts/lib/book.mjs`, and
`plugins/skraft-framework/src/domain/yaml-parser.mjs` (which `book.mjs` imports).

**This is the one mechanic in the suite that has not been verified**: whether vally accepts a
`src:` that escapes the spec's own directory is unknown, because the suite has never been run.
If it refuses, the fix is a staging step in `environment.commands` rather than committed copies.

## Why it is disabled

Listed in [`eng/vally-adapter/skip-evals.txt`](../../../eng/vally-adapter/skip-evals.txt).
Before it can be taken off that list:

1. **The `..` in `src:` needs confirming** — see above.
2. **`check-citations.mjs` is staged but ungraded.** GENESIS fixture C-03 expected it to pass on
   the new pages; that needs a `docs/site/_data/citations.yml` in the fixture, which none of the
   three currently carry. The stimulus grades completeness and honest hedging instead, which is
   the part of C-03 that does not depend on a citation corpus.
3. **This is the most expensive suite in the repository.** Three stimuli × `runs: 3`, each one
   dispatching two or three specialists on `claude-sonnet-4.6`, with a 10-minute ceiling on two
   of them.
4. **The agent's real habitat is gh-aw** — it runs under safe-outputs with no write token and
   emits a pull request. The stimuli grade the repair in the workspace and stop short of the PR,
   which is the honest boundary of what this executor can observe.

## Running it once the above is settled

```bash
SKIP_EVALS="" ./eng/run-vally-evals.sh agents skraft-docs-orchestrator
```
