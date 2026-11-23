---
name: design-quality-gates-javascript
description: Use in a plain JavaScript/Node.js component tested with `node --test` to pick or check the gate command lines of its skraft-design-config.json entry from its checked-in package scripts, or to read and kill the surviving mutants of the developer's own mutation run. Not for TypeScript or Vitest packages (design-quality-gates-typescript) or coverage enforcement.
---

# Quality Gates — JavaScript (node --test)

In a skraft pipeline step, the engine runs each gate from the component's `commands` in
`skraft-design-config.json`, from the component root, and keeps the evidence: never run a gate to
produce evidence, never write an evidence file, never launch a mutation run. Outside a
pipeline, when the developer asks for a gate, run its command line below from the component
root and report its exit code and verdict line. Thresholds come from `design-skraft-quality-bar`.

Mutation testing is the developer's: skraft runs no mutation tool and ships no mutation
script or config. The developer picks the tool (StrykerJS with its TAP runner), writes its
config and runs it apart from the pipeline.

## Gate command lines

| Gate | Command line in `skraft-design-config.json` |
|---|---|
| test, build, lint | the package's own `test`, `build`, `typecheck` or `lint` script (`npm run lint`), only when it exists; an absent script is no gate, never a pass |
| test (no script) | `node --test --test-reporter=spec --test-reporter-destination=stdout <explicit test paths>` |

- The `test` command prints the spec reporter to stdout only, which names each failing test and
  why; a package `test` script adds the same `--test-reporter` pair.
- Never use `npx` or install packages for a gate. `node --check <source>` checks syntax only;
  it is not compilation or architecture validation.
- Line coverage is **not implemented** for this stack: leave the `coverage` command out and
  report it as a gap, never as a pass.

## Read the survivors

When the developer hands over the survivors of their own mutation run, each one as a file, a
line, a mutator and whether a test covers it:

| Survivor | Action |
|---|---|
| Real gap: a behavior change no test catches | Write ONE test at the exact edge, asserting the observable outcome |
| No coverage | Write the missing behavior test |
| Equivalent | Rewrite the construct so the mutant disappears, or report it to the developer with the reason |

Never add a negative `mutate` pattern, a global exclusion or a lower threshold to buy a score.
A test that kills no mutant is noise: delete it.
