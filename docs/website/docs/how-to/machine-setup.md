---
title: "Set up your machine for SKRAFT"
description: "Configure Copilot CLI permissions, Assisted reviewer instructions and documentation sites without pre-approving human pipeline decisions."
persona: software-engineer
---

# Set up your machine for SKRAFT

Reduce repetitive permission prompts during a SKRAFT run by configuring GitHub Copilot CLI
on your machine, not in the plugin. These settings were read in **Copilot CLI 1.0.107**;
check `copilot help config`, `copilot help permissions` and `copilot config --help` after upgrades.

## Prerequisites <!-- #prerequisites -->

- Copilot CLI 1.0.107 or later, signed in.
- [SKRAFT installed](./install-on-a-host.mdx).
- Least-privilege credentials, limited to repositories you work on.

## 1. Choose the permission scope <!-- #permission-scope -->

| Scope | File or command | Settings |
| --- | --- | --- |
| Machine | `~/.copilot/settings.json`, or `$COPILOT_HOME/settings.json`; `copilot config` | `defaultPermissionMode`, `assistedApprovalInstructions`, `allowedUrls`, `deniedUrls` |
| Repository | `.github/copilot/settings.json`; `copilot config --repo` | Repository-supported settings, including `deniedUrls`; not the three machine-only settings above |
| Launch | `copilot --allow-tool … --deny-tool …` | Session tool rules |
| Folder | `~/.copilot/permissions-config.json` | Saved "don't ask again" approvals; `/reset-allowed-tools` clears them |

A repository cannot widen your permissions. `copilot config --repo allowedUrls github.com`
fails with `Setting "allowedUrls" cannot be set in .github/copilot/settings.json`.

## 2. Enable Assisted mode <!-- #assisted-mode -->

```console
$ copilot config defaultPermissionMode assisted
```

:::warning[Assisted is not a security boundary]

A reviewer model may approve dangerous or unintended actions. Keep least-privilege credentials,
sandboxing and egress controls; permission instructions are not isolation.

:::

This setting is ignored on resumed sessions, non-interactive runs (`-p`, SDK, `--acp`), and
launches elevated by `--allow-all` or `--yolo`. For one session, use `copilot --assisted-approval`.

## 3. Give the reviewer bounded instructions <!-- #reviewer-instructions -->

`assistedApprovalInstructions` addresses the Assisted reviewer, not the working agent.
Save this English list as `assisted-approval-instructions.md` in your current directory.
Adapt build commands to your repository; do not approve arbitrary commands just by program name.

```text
Approve without asking:
- ordinary source and documentation reads inside the repository, excluding secrets
- git: status, diff, log, show, blame, rev-parse, ls-files, ls-remote, fetch
- gh: issue view/list, pr view/list/diff/checks, repo view, api GET
- configured build, lint and test commands inside the repository
- GET requests to allowed documentation domains, without uploads or credentials
- source edits and tracking files inside the repository, excluding secrets

Always ask:
- git push, history rewrites, destructive checkout/restore, clean, branch deletion, tags
- forge writes, publication, uploads, global or system installation
- reads of secrets, tokens, keychains, .env*, ~/.ssh, ~/.config/gh, ~/.aws, ~/.azure
- writes or deletions outside the repository
- pipeline answers, ADR ratification and publication consent
```

Store its content with the command for your shell:

```console title="POSIX"
$ copilot config assistedApprovalInstructions "$(cat assisted-approval-instructions.md)"
```

```console title="PowerShell"
PS> copilot config assistedApprovalInstructions (Get-Content -Raw assisted-approval-instructions.md)
```

Changing instructions does not enable Assisted mode. An empty value clears them.

## 4. Allow only required documentation sites <!-- #documentation-sites -->

Each call appends one distinct pattern. A bare domain and its wildcard differ:

```console
$ copilot config allowedUrls microsoft.com
$ copilot config allowedUrls '*.microsoft.com'
$ copilot config allowedUrls github.com
$ copilot config allowedUrls nodejs.org
```

Add your stack's sites, for example `react.dev`, `docs.pytest.org`, `maven.apache.org` or
`nuget.org`. `deniedUrls` wins; without an explicit protocol, patterns mean `https://`.
Use `copilot config --repo deniedUrls <domain>` to narrow access for a repository.

## 5. Use narrow launch rules instead <!-- #launch-rules -->

Without Assisted mode, save a wrapper in your shell profile. For example:

```console
$ copilot --allow-tool 'shell(git status)' --allow-tool 'shell(git diff)' --allow-tool 'shell(gh issue view)' --deny-tool 'shell(git push)'
```

These arguments work in POSIX shells and PowerShell. `--deny-tool` wins, even over
`--allow-all-tools`. Do not allow `shell(git:*)` or the entire `skraft` MCP server: those
also permit writes or decisions, not just reads.

Keep pipeline answers, ADR ratification and publication outside automated approvals. Answer the
run's exact question through native chat; publication consent uses host confirmation
([Answer a question](./answer-a-question.mdx)).

## Troubleshooting <!-- #troubleshooting -->

### Assisted does not start <!-- #assisted-does-not-start -->

Start a fresh interactive session. A managed `permissions.disableAssistedPermissionsMode`
policy disables Assisted; use narrow launch rules instead.

### A site or repository still prompts <!-- #still-prompts -->

Check bare and wildcard domains, protocol and `deniedUrls`. Saved approvals apply per folder.
Inspect settings with `copilot config --list` and `copilot config --repo --list`.

## Next steps <!-- #next-steps -->

- [First run under Copilot CLI](../tutorials/first-run-copilot.md)
- [Answer a question](./answer-a-question.mdx)
- [Host reference](../reference/hosts.md)
