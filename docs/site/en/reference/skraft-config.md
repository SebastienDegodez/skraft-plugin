---
layout: doc
lang: en
title: "skraft-config.json"
description: "The component configuration file: location, full schema, validation and messages, command lines, gates, detection defaults and the base rule."
persona: tech-lead
---

# skraft-config.json

> `skraft-config.json` tells the engine which components make up the repository and which commands, always those the developer wrote, build and test them.

How to describe a repository's components step by step: [Configure the components]({{ "/en/how-to/configure-components" | relative_url }}). Why commands written in a versioned file rather than guessed: [Architecture]({{ "/en/explanation/architecture" | relative_url }}).

## Location {#location}

The file sits **at the root of the repository that starts the run** (the working copy), next
to `.copilot-tracking/`. A missing file is not an error: it counts as a config with no
component. `skraft init` without a slug creates or completes it.

The configuration read is the merge of four layers, each a JSON Merge Patch (RFC 7386) on the
ones before it; a `null` removes what a lower layer set:

| Order | Layer | Committed | May hold |
| --- | --- | --- | --- |
| 1 | the plugin's defaults | — | `models`, `assign` |
| 2 | `~/.skraft/config.json` (the developer's home folder) | no | any key but `components` |
| 3 | `skraft-config.json` (root of the working copy) | yes | every key |
| 4 | `skraft-config.local.json` (beside the previous one) | no | any key but `components` |

Each file is validated on its own, then the merge is validated. JSON schemas:
`schemas/skraft-config.schema.json` and `schemas/skraft-config.local.schema.json` in the plugin.

```mermaid
flowchart TD
    I[skraft init] -->|detects| F[skraft-config.json]
    F -->|read and validated| V{valid?}
    V -->|no| R[refused config-invalid<br/>every error]
    V -->|yes| B[base per repository<br/>git merge-base HEAD ref]
    B --> G[skraft gate<br/>build → format → lint → test<br/>→ architecture → coverage → mutation]
    F --> D[skraft doctor]
```

## Example {#example}

```json
{
  "baseBranch": "main",
  "components": [
    { "name": "api", "root": "services/payment-api", "stack": "dotnet",
      "paths": { "src": ["src/"], "tests": ["tests/"] },
      "commands": { "build": "dotnet build --nologo", "test": "dotnet test --nologo",
                    "format": "dotnet format --verify-no-changes",
                    "mutation": "dotnet stryker --since:{baseSha}" } },
    { "name": "web", "root": "../payment-web", "stack": "react", "baseBranch": "develop",
      "mocking": { "strategy": "inprocess" },
      "commands": { "build": "npm run build", "lint": "npm run lint", "test": "npm test" } }
  ]
}
```

## Schema — top level {#top-level}

| Key | Type | Default | Rule |
| --- | --- | --- | --- |
| `baseBranch` | string | absent (the base falls back to `main`) | git ref: no blank, does not start with `-`; `null` counts as absent |
| `components` | array of objects | `[]` | each entry is a component (below) |
| `tdd` | object | `{ "replay": "all" }` | `{ "replay": "all" }`, `{ "replay": "last-red" }`; `replay` absent or `null` counts as `all`; see [tdd](#tdd) |
| `publish` | object | `{}` | see [publish](#publish) |
| `models` | object | the plugin's Claude Code aliases per tier | model family → `tier` and, per host (`claude-code`, `copilot`), `{ "model": name or list, "effort": level }`; see [Customise SKRAFT]({{ "/en/how-to/customisation" | relative_url }}#models-and-effort) |
| `assign` | object | lenses `reviewer`, workers `implementer`, `solution-researcher` `researcher`, `solution-architect` `planner`, `pr-writer` `economy`, default `implementer` | `{ "default", "types", "agents" }`: a family, `inherit`, or `{ "family", "<host>": { "effort" } }`; also read from `~/.skraft/config.json` and `skraft-config.local.json` |
| `rank`, `workflow` | — | — | refused: `rank is no key: …`, `workflow is no key: …` |
| any other key | any | — | kept as is, never read or rewritten |

`components` is allowed only in `skraft-config.json`; in a personal layer:
`components belongs in skraft-config.json, never in <file>`.

## Schema — one component {#component}

Any key outside this list is refused.

| Key | Type | Default | Rule |
| --- | --- | --- | --- |
| `name` | string | required | kebab-case (`api`, `payment-web`); unique in the file |
| `root` | string | required | path relative to the working copy, not empty, never absolute (`/x`, `\x`, `C:x`); may point to a neighbour repository (`../payment-web`); normalised (`./api/` becomes `api`) |
| `stack` | string | required | `dotnet`, `java`, `python`, `typescript`, `javascript` or `react` |
| `commands` | object | `{}` | name → command line; name among `build`, `format`, `lint`, `test`, `architecture`, `coverage`, `mutation`, `e2e`; non-empty line |
| `baseBranch` | string | absent (falls back to the global `baseBranch`) | git ref; `null` counts as absent |
| `mocking` | object | `inprocess` for `typescript`, `javascript` and `react`, `microcks` otherwise | `strategy` is `microcks`, `inprocess` or `null`; absent or `null` means the stack's default. The engine passes it in the brief and picks the matching mocking skill |
| `paths` | object | `["."]` for each key, the whole root | `{ "src": […], "tests": […] }`, folders relative to the component root, never absolute nor starting with `..`; `skraft init` writes them. In DELIVER, the software engineer may write only there (write scope) |
| `contractTesting` | boolean | `false` | `true` makes the software engineer read the contract testing skills of its stack; the review lenses see the setting among the component settings |
| `mutationReport` | string | absent: the report the stack's tool writes, relative to the root: `StrykerOutput/reports/mutation-report.json` (.NET), `reports/mutation/mutation.json` (TypeScript, JavaScript, React), `mutation-report.json` (Python), `target/pit-reports/mutations.xml` (Java; `build/reports/pitest/mutations.xml` when the mutation command names Gradle) | the file the `mutation` command writes its report to, relative to the component root, never absolute nor outside it. The mutation gate reads its surviving mutants there and judges the 100 % / 80 % bar |

Quality thresholds (coverage, mutation…) are **not** configurable: no key carries them.

## `tdd` {#tdd}

| Key | Value | Effect |
| --- | --- | --- |
| `replay` | `all` (default) | the engine replays each red commit (`test(<story>): …`) of an attempt with its component's `test` command, and checks that it fails |
| `replay` | `last-red` | only the last red commit of each story (same commit scope) is replayed |
| `replay` | `null` | counts as `all` |

With `all`, when the replays take more than 20 % of a phase's duration, the engine journals
`tdd.replay-slow` once per phase and prints `<slug>: replaying test commits took N% of <PHASE>;
set "tdd": { "replay": "last-red" } in skraft-config.json to replay only the last test commit of
each story`. Any other value: `tdd must be { "replay": "all" or "last-red" }`.

## `publish` {#publish}

| Key | Type | Default | Effect |
| --- | --- | --- | --- |
| `pullRequest` | boolean | absent: `publish-consent` question | the run may push its branch, open or update its pull request and keep a progress comment on its story's issue |
| `visuals` | boolean | absent: `reporting-consent` question (only with a front end) | the run may publish a front end's screenshots and videos in the pull request |
| `draft` | boolean | `true` | a pull request skraft opens is a draft |
| `reviewComment` | boolean | absent: asked once per repository | `skraft review --pr --publish` may keep one comment on the pull request it reviews; written by hand in the team's file, it wins over each developer's answer, which the engine keeps in their `~/.skraft/config.json` (`reviewComments`) |
| `questionVersions` | object | `1` per key | the version of the question's text each answer was given to (`visuals`, `pullRequest`, `reviewComment`, whole numbers from 1); an acceptance of an earlier version is asked again |

The engine writes `pullRequest` or `visuals`, and their `questionVersions`, when a human answers
the question, every other key of the file kept. Any other key or value:
`publish must be an object of visuals, pullRequest, reviewComment and draft, each true or false`.

## Validation and messages {#validation}

The engine validates the whole file and returns **every** error at once, joined with `; `,
as `skraft-config.json is invalid: <error>; <error>…` (code `config-invalid`). In the
messages, `<label>` is `component <name>` when the name is a string, `components[<index>]`
otherwise.

| Case | Exact message |
| --- | --- |
| not JSON | `skraft-config.json is not JSON` (never the parser's message, which quotes the file) |
| not an object | `skraft-config.json must hold a JSON object` |
| global `baseBranch` | `baseBranch must be a git ref, got <JSON value>` |
| `tdd` | `tdd must be { "replay": "all" or "last-red" }` |
| `publish` | `publish must be an object of visuals, pullRequest, reviewComment and draft, each true or false`; `publish.questionVersions must be an object of visuals, pullRequest and reviewComment, each a whole number from 1` |
| `rank`, `workflow` | `rank is no key: …`; `workflow is no key: …` |
| `components` outside `skraft-config.json` | `components belongs in skraft-config.json, never in <file>` |
| `components` not an array | `components must be an array` |
| entry not an object | `components[<index>] must be an object` |
| name | `components[<index>].name must be kebab-case, got <JSON value>` |
| duplicate name | `component name <name> is used twice` |
| unknown key | `<label>: unknown key <key> (allowed: name, root, stack, paths, commands, baseBranch, mocking, contractTesting, mutationReport)` |
| root | `<label>: root must be a path relative to the working copy` |
| stack | `<label>: stack must be one of dotnet, java, python, typescript, javascript, react` |
| `commands` not an object | `<label>: commands must be an object of command lines` |
| command name | `<label>: unknown command <name> (allowed: build, format, lint, test, architecture, coverage, mutation, e2e)` |
| empty line | `<label>: command <name> must be a non-empty command line` |
| component `baseBranch` | `<label>: baseBranch must be a git ref, got <JSON value>` |
| `mocking` | `<label>: mocking must be { "strategy": "microcks" or "inprocess" }` |
| `paths` | `<label>: paths must be { "src": [...], "tests": [...] }`; `<label>: paths.<key> must list folders inside the component root` |
| `contractTesting` | `<label>: contractTesting must be true or false` |
| `mutationReport` | `<label>: mutationReport must be a file inside the component root` |

## Command lines {#command-lines}

A `commands` line runs **with no shell**, from the component's root. The same line therefore
behaves the same way under sh, PowerShell and cmd.

| Rule | Detail |
| --- | --- |
| Splitting | on blanks; the first word is the program |
| Quotes | `"…"` and `'…'` keep blanks inside one argument; no escape character |
| `{baseSha}` | replaced, before splitting, with the base SHA of the component's repository |
| Shell syntax | a word written with no quotes that contains <code>&#124;</code>, `&`, `;`, `<` or `>` is refused |
| Nothing interpreted | no variable, wildcard or redirection: each word goes to the program as is |
| Program | looked up on the PATH (and PATHEXT under Windows); a path with `/` or `\` starts from the component's root |
| Windows | a `.cmd` or `.bat` (npm, npx, gradlew.bat) goes through cmd.exe, arguments escaped |

Messages refusing a line (prefixed with `command "<line>"` in a gate, with `"<line>"` in the
doctor):

| Case | Message |
| --- | --- |
| shell syntax | `uses shell syntax (<word>); put the steps in a script and call the script` |
| unclosed quote | `has an unclosed <quote> quote` |
| `{baseSha}` with no base | `uses {baseSha} but the run has no base for this repository` |

To chain steps (`a && b`), write them in a script of the repository and call the script.

## Gates {#gates}

A **gate** is a command whose name is one of the seven names below. They run in this order,
whatever the order in the file:

| Order | Name |
| --- | --- |
| 1 | `build` |
| 2 | `format` |
| 3 | `lint` |
| 4 | `test` |
| 5 | `architecture` |
| 6 | `coverage` |
| 7 | `mutation` |

`e2e`, the only other name allowed, is not a gate: `skraft gate` does not run it, but
`skraft doctor` checks it. A misspelt name (`tset`) makes the configuration invalid instead
of silently skipping the gate. A component with no gate command fails (gate `none`, class `environment`):
`no gate command; give it at least one of build, format, lint, test, architecture, coverage,
mutation in skraft-config.json`. A component stops at its first failing gate.

A line that starts with `python` starts the first interpreter found from the component's
root: `.venv/bin/python`, `.venv/Scripts/python.exe`, then `python` and `python3` on the
PATH. The file keeps `python` and stays the same on Windows, macOS and Linux. Any other
program starts as written.

With Microcks (the default outside TypeScript, JavaScript and React), the tests that use it run
Microcks in a container, Docker or Podman. The engine does not look for one: such a test fails when
no container answers, like any failing test.

## Failure classes {#failure-classes}

| Class | Case | Reason shown | Who acts |
| --- | --- | --- | --- |
| `environment` | program or folder not found, program cannot start | `<error>; install it or change the command in skraft-config.json` | a human, on the machine or the config |
| `environment` | exit code 127 (sh) or 9009 (cmd) | `exited <code>` | same |
| `environment` | program stopped by a signal | `<program> was stopped by <signal>; run it again` | same |
| `environment` | line refused (shell syntax, quote, `{baseSha}`) | `command "<line>" <reason>` | same |
| `environment` | component with no gate command | `no gate command` message above | same |
| `deterministic` | any other non-zero exit code | `exited <code>` | the code must change |

Under the CLI and Copilot, a command's output is kept up to 64 MiB per stream. Past that, the evidence keeps its head and
its tail around `… output cut …`, the command still runs to its end, and its exit code still
judges the gate; its reason, pass or fail, ends with `; its output passed the runner's limit:
the evidence keeps only its head and its tail`.

## Changed components {#changed-components}

Without `--all`, `skraft gate` runs only the components **changed since their base**: files
changed since the base SHA (commits, index, working tree) and untracked files, under the
component's root. These do not count: files under `.copilot-tracking/` and files of a
component nested inside this one. A component with no base (root outside any Git
repository), or whose changes Git cannot list, counts as changed. `skraft gate --all` runs
them all. In DELIVER, a gate node runs the changed components first; once they pass, a goal
gate (`goal_gate=true`) runs the others too, so DELIVER closes on every component.

## Base rule {#base}

The **base** of a repository is the commit it is compared from: `git merge-base HEAD <ref>`,
computed in each component's repository and in the working copy's.

| Priority | Source of `<ref>` | Journaled `source` |
| --- | --- | --- |
| 1 | `--base <ref>` | `flag` |
| 2 | component `baseBranch` | `component` |
| 3 | global `baseBranch` | `config` |
| 4 | `main` | `default` |

- When the ref has no local merge base, the engine tries `origin/<ref>`.
- A folder outside any repository has no base; that is not an error.
- With no merge base even with `origin/<ref>`: refused `base-unresolved`, one part per
  repository without a base (`the working copy (<repository>) has no merge base with <ref>`
  or `component <name> (<repository>) has no merge base with <ref>`), joined by `; `, then
  `; set baseBranch in skraft-config.json or pass --base <ref>`.
- When the config lists components and Git does not start: refused
  `source-control-unavailable`.
- The base is journaled in `run.started.base` at the **first** init of the slug. A resume
  keeps the journaled base.

## Detection (`skraft init` without a slug) {#detection}

The engine looks for projects in the working copy and in each `--add` folder, down to
**3 levels**, skipping hidden folders and `node_modules`. A project under a project of the
**same family** is not a component (a `.csproj` under a solution); a project of **another
family** is one (a React front end under a .NET solution). Families: `dotnet`, `java`,
`python`, `js` (typescript, javascript, react).

In one folder, the first marker found in this order decides the stack:

| Stack | Markers | `build` | `test` | Other commands |
| --- | --- | --- | --- | --- |
| `dotnet` | `*.sln`, `*.slnx`, `*.csproj`, `*.fsproj`, `*.vbproj` | `dotnet build --nologo` | `dotnet test --nologo` | `format`: `dotnet format --verify-no-changes`; `mutation`: `dotnet stryker --since:{baseSha}` |
| `java` (Maven) | `pom.xml` | `mvn -B -q -DskipTests package` (`./mvnw` when present) | `mvn -B -q test` (`./mvnw` when present) | — |
| `java` (Gradle) | `build.gradle`, `build.gradle.kts` | `gradle build -x test` (`./gradlew` when present) | `gradle test` (`./gradlew` when present) | — |
| `python` | `pyproject.toml`, `setup.py`, `setup.cfg`, `requirements.txt` | `python -m compileall -q src` (`.` with no `src` folder) | `python -m pytest -q -p no:cacheprovider` | — |
| `react` / `typescript` / `javascript` | `package.json` | `npm run build` when a `build` script exists, otherwise `npx tsc --noEmit` (not for javascript) | `npm test` when a `test` script exists, otherwise `npx vitest run` with a vitest dependency, otherwise `npx jest` with a jest dependency | `lint`: `npm run lint` when a `lint` script exists |

For `package.json`: `react` with a `react` dependency, otherwise `typescript` when
`tsconfig.json` exists or with a `typescript` dependency, otherwise `javascript`. The
dependencies read are `dependencies` and `devDependencies`.

Proposed `paths`:

| Stack | `src` | `tests` |
| --- | --- | --- |
| `dotnet`, `python` | `src/` when it exists, otherwise `./` | `tests/` and/or `test/` when they exist |
| `java` without modules | `src/main/` | `src/test/` |
| `java` Maven with modules | the `pom.xml` `<module>`s other than test modules | the modules whose name holds the word `test`, `tests` or `it` (alone or separated by `-`) |
| JS / TS / React | `src/` when it exists, otherwise `./` | `tests/`, `test/`, `__tests__/` when they exist, otherwise as `src` |

**Name**: the folder name in kebab-case (`PaymentApi` becomes `payment-api`), the working
copy's folder name for the root, `app` when nothing is left; `-2`, `-3`… when the name is
taken. A root already listed is not proposed again. The engine writes neither `mocking` nor
`baseBranch`: the defaults apply.

## Pitfalls & anti-patterns

- **A shell chain in `commands`** (`npm ci && npm test`): refused. Put the steps in a script
  and call it.
- **Relying on an environment variable** (`$HOME`, `%PATH%`) in a line: it goes to the
  program as is.
- **A misspelt gate name** (`Test`, `unit-test`): it is not a gate and never runs in
  `skraft gate`.
- **An absolute root**: refused; a neighbour repository is written `../name`.
- **Forgetting Docker or Podman with Microcks**: start one before the tests, or switch the
  component to `inprocess` when it does not mock with Microcks.

## Going further {#see-also}

- [Configure the components]({{ "/en/how-to/configure-components" | relative_url }})
- [Run the gates and read their evidence]({{ "/en/how-to/run-gates" | relative_url }})
- [What you can adapt, and the risk]({{ "/en/how-to/customisation" | relative_url }})
- [The skraft command line]({{ "/en/reference/cli" | relative_url }})
- [Tracking folder and journal]({{ "/en/reference/run-journal" | relative_url }})

Terms to know: **component**, **gate**, **base**, **Microcks** — see the
[glossary]({{ "/en/reference/glossary" | relative_url }}).
