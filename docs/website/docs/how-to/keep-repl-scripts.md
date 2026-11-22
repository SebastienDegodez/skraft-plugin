---
title: "Keep your REPL scripts in .repl"
description: "Write helpers every REPL cell finds in .repl/lib, install their packages, reload them, and keep a script an agent wrote."
persona: software-engineer
---

# Keep your REPL scripts in `.repl`

When the agents of a run build, test or check your code, they do it in a JavaScript REPL, one cell
at a time. This page shows how to give them helpers of your own, written once in your repository
and found in every cell: a test runner filtered on one scenario, a look at a page in a browser,
whatever your project repeats.

## What the REPL is

`skraft_repl` is the tool through which the acceptance designer and the software engineer run your
project's commands. Each call sends a cell of JavaScript to a Node process kept for the attempt (the
kernel): variables stay from one cell to the next, and a cell starts a program with `run()`, or a
gate with `gate()`. The engine writes down every program it started, signed, in the attempt's
folder. `skraft_repl_reset` ends that kernel and its programs; the next cell starts a fresh one.
The details are in [The REPL](../reference/repl.md).

## What you need

- skraft initialised in the working copy (`skraft init`): it lists `.repl/node_modules/` in your
  `.gitignore`.
- Node 22 or later on the machine, the one the REPL runs on.

## 1. Write a helper in `.repl/lib`

Each file `.repl/lib/<name>.mjs` is a module the kernel imports when it starts. Its named exports
reach every cell as `lib.<name>`. A module runs in the kernel, so it may call `run` and `gate` as a
cell does.

A test runner filtered on one name, `.repl/lib/tests.mjs`:

```js
// lib.tests.only('Checkout') runs the tests whose name holds Checkout, and only those.
export const only = (name, { cwd = 'api' } = {}) =>
  run(['dotnet', 'test', '--nologo', '--filter', `FullyQualifiedName~${name}`], { cwd, label: `only ${name}`, timeout: 900 })
```

A cell then reads:

```js
const result = await lib.tests.only('Checkout')
result.exitCode
```

A file name must be a JavaScript identifier: `tests.mjs` and `e2eHelpers.mjs` load, `e2e-helpers.mjs`
does not, and the first result of the kernel names it. A module that throws when it loads, or takes
more than ten seconds, is left out, and the kernel goes on without it. The first result also says
what it loaded: `lib: browser, tests`.

## 2. Declare the packages the helpers need

A helper may import packages. Declare them in `.repl/package.json`, install them, and commit the
manifest and its lockfile:

```sh
npm install --prefix .repl playwright@1.49.1
git add .repl/package.json .repl/package-lock.json .repl/lib
```

On another machine, or in CI, `npm ci --prefix .repl` installs the same versions. `.repl/node_modules/`
is never committed. When `.repl/package.json` names packages and `.repl/node_modules/` is absent,
the first result of the kernel says so and names that command.

A Playwright helper, `.repl/lib/browser.mjs`, that runs the end-to-end tests of one scenario and
opens a page to read its title and its console errors:

```js
import { chromium } from 'playwright'

// lib.browser.scenario('S2') runs the Playwright tests whose title holds S2.
export const scenario = (title, { cwd = 'web' } = {}) =>
  run(['npx', 'playwright', 'test', '--grep', title, '--reporter=line'], { cwd, label: `e2e ${title}`, timeout: 900 })

// lib.browser.peek('http://localhost:5173/cart') says what the page shows and what it logged as errors.
export const peek = async (url) => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    const errors = []
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
    await page.goto(url)
    return { title: await page.title(), errors }
  } finally {
    await browser.close()
  }
}
```

The browsers Playwright drives are installed once per machine: `npm exec --prefix .repl -- playwright install chromium`.

## 3. Keep a gate a gate

A gate counts only as a program the server started and traced. Run the gate's command through
`gate()`, from a cell or from a helper:

```js
// .repl/lib/gates.mjs
export const e2e = () => gate('e2e', 'npx playwright test', { cwd: 'web', timeout: 1800 })
```

A filtered run, such as `lib.tests.only(…)`, is no gate: it helps the agent work, and the full gate
still has to run. Importing a gate script in a cell and calling its function proves nothing either:
no run is traced. Start it with `gate(name, ['node', '<path of the script>', …])`.

## 4. Reload the library

The kernel imports `.repl/lib` when it starts, and only then. After you change a helper, have the
agent call `skraft_repl_reset`: the next cell starts a kernel that imports your new version. The
variables of the earlier kernel are gone; run numbers go on.

## 5. Keep a script an agent wrote

The library is yours. Agents use it and never write it during an attempt: an agent that wants a
helper writes it in a cell. Every cell's code is kept in the attempt's folder, beside the trace of
its runs:

```text
.copilot-tracking/skraft-plans/<slug>/logs/runs/<step>-<visit>-<attempt>/
  runs.jsonl     the signed trace of the runs
  cell-1.mjs     the code of the first cell
  cell-2.mjs
  cell-2.log     the output of cell 2, when its result was cut
  1.log          what run 1 printed
```

Cell numbers go on across a reset, so no file is written over. These files are not committed, and
skraft never deletes them. To keep a script you liked, copy it into the library, turn it into an
exported function, and commit it:

```sh
cp .copilot-tracking/skraft-plans/checkout/logs/runs/deliver-1-2/cell-4.mjs .repl/lib/seed.mjs
```

## Troubleshooting

| The first result says | Do |
| --- | --- |
| `lib: <name>.mjs is not loaded: the name of a module must be a JavaScript identifier` | rename the file: letters, digits, `_` or `$`, not starting with a digit |
| `lib: <name> could not be loaded` | run `node .repl/lib/<name>.mjs` to see the error it throws on load, fix it, then `skraft_repl_reset` |
| that `.repl/node_modules` is missing | `npm ci --prefix .repl` |
| nothing about a helper you just changed | the kernel started before the change: `skraft_repl_reset` |
