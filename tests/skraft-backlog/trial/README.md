# skraft-refine trial

`run-trial.mjs` runs the workflow for real on a repository you own and checks each proposal
comment. Every scenario is a paid agent run: run it by hand before a release, never in CI.

```sh
gh extension install github/gh-aw
node tests/skraft-backlog/trial/run-trial.mjs --repo <you>/skraft-refine-trial --dry-run
node tests/skraft-backlog/trial/run-trial.mjs --repo <you>/skraft-refine-trial
```

The trial repository needs the engine secret (`COPILOT_GITHUB_TOKEN`), and the skills the
workflow pins (`#v<version>`) must exist at that tag, so run it against a released version.

| Scenario | Checks |
|---|---|
| `ready-issue` | an English issue that clears the DoR, reviewed against the PRD it links |
| `vague-criteria-fr` | a French issue: French headings and Gherkin, vague and technical criteria named |
| `too-big` | a size above 8 comes with a split |
| `english-issue` | English headings and Gherkin |
| `ambiguous-prd` | an unlinked PRD/BRD is offered for confirmation, never reviewed against |
| `already-refined` | the same issue dispatched again gets no second proposal |

The deterministic half of the flow (marker, documents, proposal checks, rendering) is covered
without a model by `tests/skraft-backlog/refinement/`.
