# License and provenance — `mikado-method` skill

## License

This skill is part of the SKRAFT framework and is distributed under the
repository license: **GNU General Public License v3.0** (see the root
[`LICENSE`](../../../../LICENSE)).

## Method

The Mikado Method is described by Ola Ellnestam and Daniel Brolund in
*The Mikado Method* (Manning, 2014). This skill uses the method's four steps
(goal, naive experiment, visualize, undo). It does not reproduce the book's text.

## Inspiration: `chaabani-anis/mikado-method`

The validation discipline was inspired by
[chaabani-anis/mikado-method](https://github.com/chaabani-anis/mikado-method),
an agent skill published under the **MIT License** (as stated in its README).

Ideas adopted:

- a mandatory deterministic validator run before every leaf commit;
- node traceability (commit SHA + exact failure message per prerequisite);
- the validator passes: parse, traceability, reference resolution, cycle
  detection, tree-direction ancestry, orphan detection, golden-master gate,
  true-leaf enumeration;
- a golden-master gate before restructuring an under-covered module;
- committing the graph before reverting the experiment.

What differs:

- graph format: Mermaid `graph TD` (the SKRAFT convention), not the
  rail-notation plain text of the upstream project;
- revert mechanism: a disposable `git worktree`, not `git checkout -- .`;
- graph location: `.copilot-tracking/skraft-plans/.../refactoring/`, not
  `docs/mikado/`;
- worker dispatch and terminal signals (`ADVANCE` / `EXPAND` / `DONE` /
  `BLOCKED`) specific to the SKRAFT `brownfield-refactorer` orchestration.

No source code or text was copied from the upstream project.
`scripts/validate-mikado.sh` was written and tested independently against the
Mermaid format. The MIT License does not require a copyright notice in this
case. This file credits the source as a matter of good practice.
