---
layout: doc
lang: en
title: "Configure the components of your repository"
description: "Detect the components into skraft-config.json, add a neighbour repository, replace a command, add a gate, choose the base, switch to in-memory mocks and check it all with skraft doctor."
persona: software-engineer
---

# Configure the components of your repository

**Goal**: a `skraft-config.json` whose every command runs on your machine, before you start a
run.

## Prerequisites

- The skraft plugin installed ([Install skraft on a host]({{ "/en/how-to/install-on-a-host" | relative_url }})).
- Node 22 or later, Git; Docker or Podman if a component keeps Microcks mocking.
- A terminal open at the root of your working copy. `skraft` is the command that [`npm i -g @skraft/cli`]({{ "/en/how-to/install-on-a-host" | relative_url }}#skraft-command) sets up; the long line `node "<plugin folder>/engine/drivers/cli/skraft.mjs"` works without it.

## 1. Detect the components

```text
skraft init
```

The engine looks for projects up to three levels below the working copy, hidden folders and
`node_modules` excluded, and writes one component per project, with its stack's default
commands:

```text
skraft-config.json: payment-api (dotnet, services/payment-api), web (react, web)
```

Open the file and read each command again. Rename a component if you wish: the rest of this page
renamed `payment-api` to `api`. Running `skraft init` again adds only new projects and leaves the
rest of the file as it is.

## 2. Add a neighbour repository

```text
skraft init --add ../payment-web
```

`--add` takes a folder relative to the working copy and can be repeated. The component it gives
has `../payment-web` as its root; its base is computed in its own repository.

## 3. Replace a command that does not work for you

A command written in `skraft-config.json` is always the one that runs. Edit the line:

```json
{ "name": "web", "root": "../payment-web", "stack": "react",
  "commands": { "build": "npm run build", "lint": "npm run lint", "test": "npm run test:ci" } }
```

Write a command to be started **without a shell**, from the component's root:

- split on blanks; `"…"` or `'…'` keep blanks inside one argument;
- no `|`, `&`, `;`, `<`, `>` outside quotes: to chain steps, call a script (`npm run test:ci`,
  `node scripts/ci-test.mjs`);
- `npm`, `npx`, `gradlew.bat` are written the same way on Windows.

## 4. Add a gate

Add the command under one of the names `build`, `format`, `lint`, `test`, `architecture`,
`coverage`, `mutation` (the run order), or `e2e`, which `skraft doctor` checks but no gate runs:

```json
"commands": {
  "build": "dotnet build --nologo",
  "test": "dotnet test --nologo",
  "architecture": "dotnet test --nologo --filter Category=Architecture",
  "mutation": "dotnet stryker --since:{baseSha}"
}
```

`{baseSha}` is replaced by the base of the component's repository. Quality thresholds cannot be
tuned.

## 5. Choose the base

Write `baseBranch`, global or per component:

```json
{
  "baseBranch": "main",
  "components": [
    { "name": "api", "root": "services/payment-api", "stack": "dotnet" },
    { "name": "web", "root": "../payment-web", "stack": "react", "baseBranch": "develop" }
  ]
}
```

`--base <ref>` given to `skraft init <slug>` or `/skraft <slug>` wins, then the component's
`baseBranch`, then the global one, then `main`
([base rule]({{ "/en/reference/skraft-config" | relative_url }}#base)). The base is journaled at
a slug's first init: to change it, start a new slug.

## 6. Switch a component to in-memory mocks

With neither Docker nor Podman on your machine, for a .NET, Java or Python component (TypeScript,
JavaScript and React are in memory by default already):

```json
{ "name": "api", "root": "services/payment-api", "stack": "dotnet",
  "mocking": { "strategy": "inprocess" } }
```

What you give up: [Adapting skraft: what each setting costs]({{ "/en/explanation/customisation-trade-offs" | relative_url }}).

## 7. Check with `skraft doctor`

```text
skraft doctor
```

Without `--run`, none of your commands runs: the doctor checks Node, the file, the forge, each component's
root, at least one gate per component and each command's program.

```text
ok    node: Node v22.11.0
ok    config: 2 components: api, web
ok    forge: github, deduced from the Git remote
ok    api/build: dotnet → /usr/local/bin/dotnet
FAIL  web/test: command not found: npx (from ../payment-web); install it or change commands.test in skraft-config.json
skraft doctor: 1 checks failed
```

Fix each `FAIL`, then run each command once, with the computed base:

```text
skraft doctor --run
```

Expected result: `skraft doctor: every check passed`, or `no check failed, N with a warning`.
Exit code 0.

## Troubleshooting

An invalid file is refused as a whole, prefixed with `skraft-config.json is invalid: `, every
error separated by `; `:

| Message | Fix |
|---|---|
| `component web: unknown key comands (allowed: name, root, stack, paths, commands, baseBranch, mocking, contractTesting, mutationReport)` | Fix the typo. |
| `component web: root must be a path relative to the working copy` | Write `web` or `../payment-web`, never `/srv/web` or `C:\…`. |
| `components[1].name must be kebab-case, got "Api"` | Lower case and hyphens: `api`. |
| `component api: mocking must be { "strategy": "microcks" or "inprocess" }` | An object, not a string. |
| `component name api is used twice` | One unique name per component. |
| `--add C:\work\payment-web is not relative to the working copy` | Give a relative path. |

Every key and every message: [skraft-config.json]({{ "/en/reference/skraft-config" | relative_url }}#validation).

## See also

- [skraft-config.json]({{ "/en/reference/skraft-config" | relative_url }}) — schema, defaults
  per stack, detection.
- [Run the gates and read their evidence]({{ "/en/how-to/run-gates" | relative_url }})
- [Choose the agents' models]({{ "/en/how-to/choose-models" | relative_url }})
