---
layout: doc
lang: en
title: "Getting started"
description: "Install SKRAFT V2, describe a small repository, run the RESEARCH phase of a story and pass its gates."
persona: software-engineer
---

# Getting started

> In this tutorial, you install SKRAFT, describe a small repository in `skraft-config.json`,
> run the RESEARCH phase of the story "#42 Pay by card" and pass the repository's gates.

You follow one path, from start to finish. Each step shows what you should see.

## What you need

- **Node 22** or later;
- **Git**;
- **Claude Code** (for GitHub Copilot CLI, see [With GitHub Copilot CLI](#with-github-copilot-cli) after the path).

## 1. Create the small repository

Create a `shop` folder, open a terminal in it and create the repository:

```text
git init -b main
```

Create the file `web/package.json` with this content:

```json
{
  "name": "web",
  "private": true,
  "scripts": {
    "build": "node --version",
    "test": "node --version"
  }
}
```

Then record a first commit:

```text
git add web/package.json
git commit -m "Start the shop"
```

You see a line `[main (root-commit) …] Start the shop`.

## 2. Install the plugin

Open Claude Code in the `shop` folder. Type these two commands **in the conversation**, not in a
terminal:

```text
/plugin marketplace add SebastienDegodez/skraft-plugin
/plugin install skraft
```

Open `/plugin`: `skraft` appears under installed plugins.

**On Windows**, if `/plugin marketplace add` fails because of a path that is too long, clone the
repository to a short path, then add that clone:

```powershell
git clone https://github.com/SebastienDegodez/skraft-plugin C:\s\skraft
```

```text
/plugin marketplace add C:\s\skraft
/plugin install skraft
```

## 3. Write `skraft-config.json`

The `skraft` command line is a Node script shipped with the plugin. Run it from the root of your
repository, in sh or in PowerShell alike:

```text
node "<skraft plugin folder>/engine/drivers/cli/skraft.mjs" init
```

Replace `<skraft plugin folder>` with the folder where the host installed the skraft plugin. From
here on, `skraft …` means this full command.

`skraft init` looks for the projects in the repository and writes one **component** per project —
a part of the repository with its root, its stack and its commands. You see:

```text
skraft-config.json: web (javascript, web)
```

Open `skraft-config.json` at the root of `shop`:

```json
{
  "components": [
    {
      "name": "web",
      "root": "web",
      "stack": "javascript",
      "paths": {
        "src": ["./"],
        "tests": ["./"]
      },
      "commands": {
        "build": "npm run build",
        "test": "npm test"
      }
    }
  ]
}
```

`build` and `test` come from the scripts in `web/package.json`.

## 4. Check with `skraft doctor`

`skraft doctor` checks that every command in the configuration can run on your machine:

```text
skraft doctor
```

If Docker is not running, a `FAIL` line appears:

```text
ok    node: Node v22.22.0
ok    config: 1 components: web
ok    web/build: npm → /opt/node22/bin/npm
ok    web/test: npm → /opt/node22/bin/npm
FAIL  docker: Docker does not answer, and Microcks, the mocking of web, needs it; start Docker, or set "mocking": { "strategy": "inprocess" } on the component
skraft doctor: 1 checks failed
```

The `npm` paths and the Node version are your machine's. If Docker is running, the `docker` line
is `ok`. Either way, the `web` component does not need Microcks: add the `mocking` line to the
component in `skraft-config.json`:

```json
      "name": "web",
      "root": "web",
      "stack": "javascript",
      "mocking": { "strategy": "inprocess" },
```

Run `skraft doctor` again:

```text
ok    node: Node v22.22.0
ok    config: 1 components: web
ok    web/build: npm → /opt/node22/bin/npm
ok    web/test: npm → /opt/node22/bin/npm
skraft doctor: every check passed
```

Any other `FAIL` line (program not found, missing root, component without a command) is fixed in
the configuration: follow the
[Configure components]({{ "/en/how-to/configure-components" | relative_url }}) guide.

## 5. Run the story in Claude Code

In the Claude Code conversation, type:

```text
/skraft checkout #42 Pay by card
```

`checkout` is the **slug**: the name of the pipeline, in kebab-case. `#42` is the issue number,
`Pay by card` its title. Claude Code answers:

```text
skraft checkout started — progress in the Skraft pane.
```

The **Skraft** pane opens. It shows the RESEARCH phase, the running agent (`solution-researcher`)
and the progress log. Wait for the closing notification:

```text
skraft checkout: done — RESEARCH closed
```

## 6. Look at `skraft status`

In the terminal, at the root of `shop`:

```text
skraft status
```

You see:

```text
skraft checkout: done
RESEARCH  closed
RESEARCH closed
```

A `cost: … USD` line may be added when the host reports the cost. The same state lives in
`.copilot-tracking/skraft-plans/checkout/events.jsonl`, one event per line, and
`.copilot-tracking/skraft-plans/.active-slug` contains `checkout`.

## 7. Open the research document

The agent filled in the document the engine had pre-created from its template:

```text
.copilot-tracking/skraft-plans/checkout/research/<YYYY-MM-DD>/checkout-research.md
```

`<YYYY-MM-DD>` is the date of the run. Open it: it is the research on "Pay by card". The engine
checked that it is not empty, not identical to the template, and has no {% raw %}`{{…}}`{% endraw %} left.

## 8. Pass the gates with `skraft gate`

**Gates** are the named commands of the components (`build`, `test`…) run as quality checks. Run
those of every component:

```text
skraft gate --all
```

You see:

```text
pass  web/build
pass  web/test
skraft checkout: gates passed — 2 gates passed on web
```

The evidence of each gate is written to `.copilot-tracking/skraft-plans/checkout/gates/web/`, for
example `build-1.log`: the command, the folder, the result, standard output and standard error.

## What you learned

- `skraft init` describes your repository as components in `skraft-config.json`;
- `skraft doctor` tells you what your machine is missing before a run;
- `/skraft <slug> #<issue> <title>` starts the story; the engine drives RESEARCH and records everything;
- `skraft status` reads the state from the journal;
- `skraft gate` runs the component commands and keeps evidence of each gate.

## With GitHub Copilot CLI

In step 5, run the dynamic workflow `skraft-pipeline` with the arguments
`{ "slug": "checkout", "issue": 42, "title": "Pay by card" }`. The engine does the same work;
progress shows in the workflow log. The other steps do not change.

## What comes next

> **Coming next.** Today, you run the gates by hand. In lot 3, gates become pipeline steps, run by
> the engine during DELIVER.

## Next pages

- [Configure components]({{ "/en/how-to/configure-components" | relative_url }})
- [Run the gates and read their evidence]({{ "/en/how-to/run-gates" | relative_url }})
- [Resume or unblock a run]({{ "/en/how-to/resume-a-run" | relative_url }})
- [The `skraft` command line]({{ "/en/reference/cli" | relative_url }})
- [Engine, drivers, depth 1]({{ "/en/explanation/architecture" | relative_url }})
