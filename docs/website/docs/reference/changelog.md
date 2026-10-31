---
title: "Changelog"
description: "The changes a user sees in skraft, grouped by version: V2 alphas, the v1 ADR migration and the v0 bootstrap."
---

# Changelog

The changes a user sees, grouped by version; the commit-by-commit detail is in `CHANGELOG.md` at the root of the repository.

## V2 — 2.0.0-alpha.1 to 2.0.0-alpha.19 (2026-10-28 → 2026-10-29) <!-- #v2 -->

### Breaking changes <!-- #v2-breaking -->

| Version | Change |
| --- | --- |
| alpha.1 | The plugin no longer ships a command hook nor v1's state and artifact CLI: the V2 engine replaces them. `events.jsonl` replaces `state.json`. |
| alpha.1 | `skraft-config.json` describes components (root, stack, paths, commands). `skraft migrate` converts the v1 configuration and the v1 runs in progress. |

### Engine and pipeline <!-- #v2-engine -->

| Version | Change |
| --- | --- |
| alpha.1 | Use-case engine; hash-chained, signed `events.jsonl` journal (`skraft journal adopt`); one driver per run (session lease). |
| alpha.1 | The pipeline is a DOT workflow: RESEARCH, DESIGN, DISTILL, DELIVER, PUBLISH; `skraft workflow eject`, `check`, `diff`; fan-out reviews, one node per lens; locked and mandatory nodes. |
| alpha.1 | The DELIVER review calls `review.skraft.dot`; ejected workflows live in `.skraft/`. |
| alpha.1 | Review in code: lenses in parallel, refutation by `finding-refuter`, verdict computed by the engine. |
| alpha.1 | Command gates per component; mutation bar 100 % core / 80 % boundary judged by the engine, survivors handled file by file. |
| alpha.1 | Human decisions: question node, `skraft decide`, ADR ratification, `environment` question. |
| alpha.1 | Run graph, reviews and gates in `skraft status`, the pane and `qa-report.md`. |
| alpha.2 | Agents get the body of their story's issue. |
| alpha.5 | The brief and `skraft doctor` name component skills found nowhere; replaying a red commit sees its dependencies and recognises an e2e red. |
| alpha.6 | Replay clean-up recognises under Windows the worktrees named by their long name. |
| alpha.7 | Messages fixed by code, cut output flagged, approximate cost, `skraft doctor --run` logs. |
| alpha.9 | Replay in npm and pnpm workspaces. |
| alpha.13 | A blocked run asks the `blocked` question: an instruction runs the node again, `STOP` ends the run. |
| alpha.15 | A `Proposed` ADR is rewritten in place; every human question is asked by the engine. |
| alpha.16 | `skraft doctor` and the run show each agent's model under the host that starts it. |
| alpha.16 | The engine no longer looks for Docker: a test that needs a container fails like any other. |
| alpha.19 | Mutation runs last, once, on the code the DELIVER review approved. On failure, `kill_proposal` writes one proposal per file of survivors without touching the code; the `mutation-plan` question lets the developer choose (`APPLY`, their instruction, `STOP`); `kill_mutants` applies the choice, then `mutation_gates` runs the gates again before a new mutation run. |
| next | ADR rules in the engine: no version, one-sentence `decision`, closed status vocabulary, published ADRs changed only in their status lines, a row in `decisions-index.md` for each ADR written; DESIGN review and ratification return once (`max_visits` 1); lens gates G17 and G18. |

### End of run and pull requests <!-- #v2-publish -->

| Version | Change |
| --- | --- |
| alpha.1 | The run ends with a draft pull request described from the journal; `skraft publish` opens it later. |
| alpha.1 | Light and dark Playwright screenshots of a front end in the pull request. |
| alpha.1 | A progress comment on the story's issue, at each phase and at the end. |
| alpha.1 | `skraft review --pr` reviews a single pull request with the `review` workflow. |
| alpha.12 | Evidence sections folded in the pull request; what waits on a human stays open. |

### Hosts <!-- #v2-hosts -->

| Version | Change |
| --- | --- |
| alpha.1 | Claude Code: `/skraft` command, `run_pipeline` tool, Skraft pane and its answer buttons. |
| alpha.1 | Copilot CLI: `skraft-pipeline` dynamic workflow, `skraft_decide` tool. |
| alpha.1 | VS Code: Copilot SDK driver (`skraft-run.mjs`) and the `skraft next` / `skraft record` fallback loop. |
| alpha.5 | Copilot CLI: the `skraft-pipeline` canvas draws the run view. |
| alpha.8, alpha.10 | Copilot CLI: each phase, then the review, opens on the host before its agents. |
| alpha.11 | Copilot CLI: a confirmation Copilot never shows sends the person to the chat or a terminal. |
| alpha.17 | Copilot CLI: a question is asked once, in the chat; the canvas shows the run's state, read-only. |

### Skills and plugins <!-- #v2-skills -->

| Version | Change |
| --- | --- |
| alpha.1 | Standalone `skraft-brownfield` plugin. |
| alpha.1 | `skraft-backlog`: `skraft-prd-backlog` workflow (mechanical fixes in code, story-by-story review, epic-by-epic creation). |
| alpha.3, alpha.4 | `quality-gates-*`: mutation report where the engine reads it; a pass with no changed core source passes the mutation gate. |
| alpha.5 | `clean-architecture-typescript` skill for a Node/TypeScript back end. |
| alpha.9 | .NET: gates, test project names and architecture templates. |

### Documentation <!-- #v2-docs -->

| Version | Change |
| --- | --- |
| alpha.18 | Versioned documentation site; the `integration/v2-next` docs are published. |

## v1 — ADR migration (2026-06)

- ADRs move out of `docs/adr/` and are consolidated under `docs/adr/`.
- `scripts/migrate-adr-layout.mjs` renumbers ADR files into a single global sequence (`adr-001-...md`, `adr-002-...md`, etc.) and rewrites reference links.
- Recommended usage:

```console
$ node scripts/migrate-adr-layout.mjs \
	--repo /path/to/repo \
	--renumber-global

# apply for real
$ node scripts/migrate-adr-layout.mjs \
	--repo /path/to/repo \
	--renumber-global \
	--apply
```

- Dry-run is the default; review the summary before adding `--apply`.
- After migration, verify `docs/adr/supersessions.md` and `ADR-*` references in DESIGN artefacts.

## v0 — Bootstrap (2026-05)

- Created the SKRAFT public documentation site.
- Pages: landing, pipeline, architecture, concepts, customisation, agent and skill reference.
- Integrated citation lint.

## See also <!-- #see-also -->

- [Migrate a working copy from v1](../how-to/migrate-from-v1.md)
- [Hosts](./hosts.md)
- [Glossary](./glossary.md)
