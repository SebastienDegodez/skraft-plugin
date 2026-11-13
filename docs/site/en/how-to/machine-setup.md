---
layout: doc
lang: en
title: "Set up your machine for SKRAFT"
description: "Configure GitHub Copilot CLI on your machine so a SKRAFT run stops asking for repetitive approvals: Assisted permission mode, reviewer instructions, allowed sites and launch-time tool rules."
persona: software-engineer
---

# Set up your machine for SKRAFT

Stop approving the same requests dozens of times during a SKRAFT run: documentation reads,
the researcher's `curl`/`sed` citation checks, read-only `git`/`gh`, build and test commands.
None of this is set in the plugin. It is the configuration of GitHub Copilot CLI on your machine.

Every setting below was read in **GitHub Copilot CLI 1.0.107** with `copilot help config`,
`copilot help permissions` and `copilot config --help`. Check them again with those commands
after a CLI upgrade.

## Prerequisites

- GitHub Copilot CLI 1.0.107 or later (`copilot --version`).
- SKRAFT installed ([Getting started]({{ "/en/tutorials/getting-started" | relative_url }})).
- Credentials with least privilege: a `gh` token limited to the repositories you work on.

## Where each setting lives

| Scope | Where | What it holds |
| --- | --- | --- |
| Machine | `~/.copilot/settings.json` (or `$COPILOT_HOME/settings.json`), written by `copilot config <key> <value>` | `defaultPermissionMode`, `assistedApprovalInstructions`, `allowedUrls`, `deniedUrls` |
| Repository | `.github/copilot/settings.json`, written by `copilot config --repo <key> <value>` | only the settings a repository can override, among them `deniedUrls`, `enabledPlugins`, `extraKnownMarketplaces`; **not** `allowedUrls`, `assistedApprovalInstructions` or `defaultPermissionMode` |
| Launch | `copilot --allow-tool … --deny-tool …` | tool and command rules for that session |
| Folder | `~/.copilot/permissions-config.json`, filled by "don't ask again" answers | saved approvals for one location only; `/reset-allowed-tools` clears them |

`copilot config --repo allowedUrls github.com` fails with
`Setting "allowedUrls" cannot be set in .github/copilot/settings.json`: a repository cannot
widen your permissions, only narrow them.

## 1. Switch to Assisted permission mode

```bash
copilot config defaultPermissionMode assisted
```

In Assisted mode a reviewer model approves the requests it judges safe and asks you for the
others. The CLI states it is **not a security boundary** and may approve dangerous or unintended
actions: keep least-privilege credentials, sandboxing and egress controls.

The setting is ignored on resumed sessions, outside interactive runs (`-p`, SDK, `--acp`), and
when `--allow-all`/`--yolo` already elevated the session. For one session only, launch with
`copilot --assisted-approval`.

## 2. Give the reviewer its instructions

`assistedApprovalInstructions` addresses the Assisted reviewer only, never the agent. Write them
in English, as short lists. Save this as `assisted-approval-instructions.md` in the current
directory from which you will run the command below:

```text
Approve without asking:
- read: any file in the repository
- git: status, diff, log, show, blame, rev-parse, branch, ls-files, ls-remote, fetch
- gh: issue view/list, pr view/list/diff/checks, repo view, api GET
- build/test .NET: dotnet restore/build/test/format, dotnet tool restore, dotnet tool run dotnet-stryker
- build/test JS/TS: npm ci, npm test, npm run lint/build/e2e, npx playwright test, npx stryker, npx tsc, npx eslint
- build/test Java: mvn/./mvnw compile/test/verify, gradle/./gradlew build/test/check, pitest
- build/test Python: pytest, python -m pytest, ruff, mypy, mutmut, uv sync/run, pip install inside a venv
- node: scripts under the skraft plugin folder
- curl/wget: GET to allowedUrls domains
- mcp skraft: doctor, init, status, report, journal, gate, workflow_check, workflow_diff
- write/delete: files inside the repository's .copilot-tracking/
- write: files inside the repository

Always ask:
- git: push, commit --amend, rebase, reset --hard, clean, checkout/switch/restore discarding changes, branch -D, tag
- gh: anything that creates, edits, closes, merges or deletes; api POST/PATCH/PUT/DELETE
- publish: npm publish, dotnet nuget push, docker push
- install: global or system (npm i -g, brew, dotnet tool install -g, pip install outside a venv)
- delete: any path outside the repository
- write: any path outside the repository
- network: domains not in allowedUrls; any upload
- secrets: .env*, ~/.ssh, ~/.config/gh, ~/.aws, ~/.azure, tokens, keychains
- mcp skraft: migrate without dry-run, workflow_eject
```

The `mcp skraft` lines apply to SKRAFT versions that ship the `skraft` MCP server; the reviewer
ignores them otherwise.

Store the file content in your machine settings:

```bash
copilot config assistedApprovalInstructions "$(cat assisted-approval-instructions.md)"
```

```powershell
copilot config assistedApprovalInstructions (Get-Content -Raw assisted-approval-instructions.md)
```

Changing this value does not enable Assisted mode by itself. An empty value clears it.

## 3. Allow documentation sites

`allowedUrls` is a list: each `copilot config allowedUrls <value>` appends one item if it is not
already there. A bare domain (`microsoft.com`) and a wildcard (`*.microsoft.com`) are two distinct
patterns; add both.

```bash
for u in github.com '*.github.com' '*.githubusercontent.com' '*.github.io' \
         microsoft.com '*.microsoft.com' playwright.dev '*.playwright.dev' \
         microcks.io '*.microcks.io' nuget.org '*.nuget.org' npmjs.com '*.npmjs.com' \
         nodejs.org developer.mozilla.org react.dev vite.dev vitest.dev \
         typescriptlang.org eslint.org stryker-mutator.io testcontainers.com \
         dotnet.testcontainers.org cucumber.io reqnroll.net; do
  copilot config allowedUrls "$u"
done
```

```powershell
foreach ($u in 'github.com', '*.github.com', '*.githubusercontent.com', '*.github.io',
               'microsoft.com', '*.microsoft.com', 'playwright.dev', '*.playwright.dev',
               'microcks.io', '*.microcks.io', 'nuget.org', '*.nuget.org', 'npmjs.com', '*.npmjs.com',
               'nodejs.org', 'developer.mozilla.org', 'react.dev', 'vite.dev', 'vitest.dev',
               'typescriptlang.org', 'eslint.org', 'stryker-mutator.io', 'testcontainers.com',
               'dotnet.testcontainers.org', 'cucumber.io', 'reqnroll.net') {
  copilot config allowedUrls $u
}
```

Add the sites of your stack the same way:

| Stack | Additional domains |
| --- | --- |
| .NET | covered by the list above (`learn.microsoft.com`, `nuget.org`, `dotnet.testcontainers.org`, `reqnroll.net`, `stryker-mutator.io`) |
| React / TypeScript | covered by the list above (`react.dev`, `vite.dev`, `vitest.dev`, `typescriptlang.org`, `eslint.org`, `npmjs.com`) |
| Python | `python.org`, `*.python.org`, `pypi.org`, `docs.pytest.org`, `docs.astral.sh`, `*.readthedocs.io` |
| Java | `maven.apache.org`, `central.sonatype.com`, `gradle.org`, `*.gradle.org`, `junit.org`, `pitest.org`, `java.testcontainers.org` |

`deniedUrls` takes precedence over `allowedUrls`. Patterns are protocol-aware: without a protocol
they mean `https://`. List what a repository must never reach with
`copilot config --repo deniedUrls <domain>`.

## 4. Allow commands and tools at launch (without Assisted)

"Don't ask again" approvals are saved per folder in `~/.copilot/permissions-config.json`. For the
whole machine, only launch options remain. Define an alias:

```bash
alias copilot-skraft="copilot --allow-tool 'skraft' --allow-tool 'shell(git:*)' --deny-tool 'shell(git push)' --allow-tool 'shell(gh issue view)' --allow-tool 'shell(gh pr view)' --allow-tool 'shell(dotnet)' --allow-tool 'shell(npm)' --allow-tool 'shell(npx)' --allow-tool 'shell(curl)' --allow-tool 'shell(sed)'"
```

```powershell
function copilot-skraft {
  copilot --allow-tool 'skraft' --allow-tool 'shell(git:*)' --deny-tool 'shell(git push)' `
    --allow-tool 'shell(gh issue view)' --allow-tool 'shell(gh pr view)' `
    --allow-tool 'shell(dotnet)' --allow-tool 'shell(npm)' --allow-tool 'shell(npx)' `
    --allow-tool 'shell(curl)' --allow-tool 'shell(sed)' @args
}
```

Put the alias in `~/.bashrc` or `~/.zshrc`, the function in your PowerShell `$PROFILE`.

- `--deny-tool` always wins, even over `--allow-all-tools`.
- `shell(git:*)` matches every `git` subcommand; `shell(git push)` then removes `push`.
- `skraft` is an MCP server name: it allows every tool of that server.

## 5. Keep human decisions in the run

Never put these in an allow-list, an `--allow-tool` rule or `assistedApprovalInstructions`:

- publication consents;
- ADR ratification;
- `skraft decide` and `skraft publish`.

The run asks them through the host dialog. Answer there.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Assisted mode does not start | Resumed session, `-p` run or `--yolo` launch: the setting is ignored there. Start a new interactive session, or pass `--assisted-approval`. |
| Assisted requests fall back to manual approval | A managed policy sets `permissions.disableAssistedPermissionsMode`. Use the launch rules of step 4. |
| `cannot be set in .github/copilot/settings.json` | The key is machine-only. Drop `--repo`. |
| A documentation site still prompts | Add both `domain` and `*.domain`; check that `deniedUrls` does not list it; `http://` needs an explicit `http://` pattern. |
| An approval given "for good" comes back in another repository | Saved approvals are per folder. Use the launch alias of step 4. |
| Check what is set | `copilot config --list` (machine), `copilot config --repo --list` (repository). |
