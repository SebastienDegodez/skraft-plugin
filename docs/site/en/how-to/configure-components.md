---
layout: doc
lang: en
title: "Configure your repository's components"
description: "Detect the components into skraft-config.json, add a neighbour repository, replace a command, add a gate, choose the base, switch to in-memory mocks and check it all with skraft doctor."
persona: software-engineer
---

# Configure your repository's components

**Goal**: get a `skraft-config.json` in which every command runs on your machine, before you start a run.

A **component** is a project the engine knows how to build and test: a name, a root, a stack and commands. The `skraft-config.json` file lives at the root of the working copy that starts the run.

## Prerequisites

- The skraft plugin installed (see [Getting started]({{ "/en/tutorials/getting-started" | relative_url }})).
- Node 22 or later, Git.
- Docker if a component keeps the default mocking (Microcks).
- A terminal open at the root of your working copy.

The command line runs this way, under sh as under PowerShell:

```
node "<plugin folder>/engine/drivers/cli/skraft.mjs" <command>
```

`<plugin folder>` is the folder where the host (Claude Code or Copilot CLI) installed the skraft plugin. The rest of this page writes `skraft <command>` for that form.

## 1. Detect the components

```
skraft init
```

The engine looks for projects up to three levels below the working copy. It skips hidden folders and `node_modules`. It writes one component per project found, with default commands for its stack.

Possible output:

```
skraft-config.json: payment-api (dotnet, services/payment-api), web (react, web)
```

A component's name comes from its folder name, in kebab-case. You can change it in the file: the rest of this page renamed `payment-api` to `api`.

Running `skraft init` again leaves the components already listed, and every other key of the file, as they are. It only adds new projects:

```
skraft-config.json already lists every project found (2 components)
```

When nothing is found and the file has no `components` key yet, it is written with an empty list:

```
no project found; skraft-config.json lists no component
```

When the file already holds `"components": []`, the output is `skraft-config.json already lists every project found (0 components)`.

Open the file and read it. The detected commands are a starting point, not a promise.

## 2. Add a neighbour repository

Your front end lives in another repository, next to yours? Add its folder:

```
skraft init --add ../payment-web
```

`--add` can be repeated for several folders. The path must be relative to the working copy. Two refusals are possible (exit code 1):

```
--add C:\work\payment-web is not relative to the working copy
--add ../payment-wbe is not a folder
```

The resulting component has the root `../payment-web`. Its base is computed in its own repository.

## 3. Replace a command that does not work for you

A command written in `skraft-config.json` is **always** the one that runs. The engine never replaces it with a default. Change the line:

```json
{ "name": "web", "root": "../payment-web", "stack": "react",
  "commands": { "build": "npm run build", "lint": "npm run lint", "test": "npm run test:ci" } }
```

How a command is written:

- It runs **without a shell**, from the component's root.
- It is split on blanks. `"…"` or `'…'` keep blanks inside one argument.
- No `|`, `&`, `;`, `<`, `>` outside quotes. To chain steps, write a script and call it (for instance an npm script or `node scripts/ci-test.mjs`).
- Under Windows, write `npm`, `npx` or `gradlew.bat` as anywhere else: the engine goes through cmd.exe for `.cmd` and `.bat` files.

## 4. Add a gate

A **gate** is a named command the engine runs to prove quality. Gate names, in the order they run: `build`, `format`, `lint`, `test`, `architecture`, `coverage`, `mutation`. The only other name accepted, `e2e`, is not a gate, but `skraft doctor` still checks it; any other name makes the configuration invalid.

Add the command under its name:

```json
"commands": {
  "build": "dotnet build --nologo",
  "test": "dotnet test --nologo",
  "architecture": "dotnet test --nologo --filter Category=Architecture",
  "coverage": "dotnet test --nologo --collect \"XPlat Code Coverage\"",
  "mutation": "dotnet stryker --since:{baseSha}"
}
```

`{baseSha}` is replaced with the base of the component's repository. A mutation run limited to the code changed since the base stays fast.

Quality thresholds are not set in this file.

## 5. Choose the base

The **base** is the commit the engine compares your work with: `git merge-base HEAD <ref>`, in each component's repository. The ref is chosen in this order:

| Priority | Where | Example |
|---|---|---|
| 1 | `--base` on `skraft init <slug>` or `/skraft <slug> --base <ref>` | `--base release/2.3` |
| 2 | the component's `baseBranch` | `"baseBranch": "develop"` |
| 3 | the global `baseBranch` | `"baseBranch": "main"` |
| 4 | default | `main` |

When the local branch does not exist, the engine tries `origin/<ref>`.

```json
{
  "baseBranch": "main",
  "components": [
    { "name": "api", "root": "services/payment-api", "stack": "dotnet" },
    { "name": "web", "root": "../payment-web", "stack": "react", "baseBranch": "develop" }
  ]
}
```

The base is journaled at a slug's first init. A resume keeps the journaled base: to change the base, start a new slug.

## 6. Switch a component to in-memory mocks

By default, a component mocks its dependencies with Microcks, which runs in Docker. The `test`, `architecture`, `coverage` and `mutation` gates then need `docker info` to answer.

With no Docker on your machine, switch the component to `inprocess`:

```json
{ "name": "web", "root": "../payment-web", "stack": "react",
  "mocking": { "strategy": "inprocess" } }
```

Read the risks in [Customise SKRAFT]({{ "/en/how-to/customisation" | relative_url }}) first.

## 7. Check with `skraft doctor`

```
skraft doctor
```

Without `--run`, the doctor runs none of your commands; it only runs `docker info` when a component uses Microcks. It checks: Node, the config file, each component's root, at least one gate per component, each command's program (on the PATH, with PATHEXT under Windows), Docker when a component uses Microcks.

```
ok    node: Node v22.11.0
ok    config: 2 components: api, web
ok    api/build: dotnet → /usr/local/bin/dotnet
FAIL  web/test: command not found: npx (from ../payment-web); install it or change commands.test in skraft-config.json
FAIL  docker: Docker does not answer, and Microcks, the mocking of api, needs it; start Docker, or set "mocking": { "strategy": "inprocess" } on the component
skraft doctor: 2 checks failed
```

To actually run each command once, with the computed base:

```
skraft doctor --run
skraft doctor --run --base develop
```

Exit code: 0 when everything passes, 1 otherwise. `--json` gives the same report as JSON.

## 8. Fix common validation errors

An invalid file is refused as a whole, with the list of all its errors, separated by `; `. Real messages:

| Message | Fix |
|---|---|
| `component web: unknown key comands (allowed: name, root, stack, paths, commands, baseBranch, mocking, contractTesting)` | Fix the typo; a component accepts only these keys. |
| `component web: root must be a path relative to the working copy` | Replace `/srv/web` or `C:\…` with a relative path (`web`, `../payment-web`). |
| `components[1].name must be kebab-case, got "Api"` | Lower case and dashes: `api`, `payment-api`. |
| `component api: unknown command Test (allowed: build, format, lint, test, architecture, coverage, mutation, e2e)` | Write `test`. |
| `component api: mocking must be { "strategy": "microcks" or "inprocess" }` | Write an object, not a string: `"mocking": { "strategy": "inprocess" }`. |
| `component name api is used twice` | Give each component a unique name. |

These errors come prefixed with `skraft-config.json is invalid: ` in `skraft init`, `skraft doctor` and `skraft gate`. When a run starts, the refusal carries the code `config-invalid`.

## See also

- [skraft-config.json reference]({{ "/en/reference/skraft-config" | relative_url }}) — every key and every default per stack.
- [Command-line reference]({{ "/en/reference/cli" | relative_url }})
- [Run the gates and read their evidence]({{ "/en/how-to/run-gates" | relative_url }})
