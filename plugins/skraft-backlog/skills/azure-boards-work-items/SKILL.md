---
name: azure-boards-work-items
description: "Use when the forge is Azure DevOps and work items must be found, read, created, updated, commented on or linked in Azure Boards: backlog discovery with WIQL or work item search, triage tags, iteration assignment, refinement comments, parent/child and duplicate links. Covers the Azure DevOps MCP server first and the az CLI (azure-devops extension) as fallback. Not for GitHub issues, pull requests, pipelines or pipeline reports."
---

# Azure Boards Work Items

## Forge

This skill serves the `azure-devops` forge only. Decide the forge once per run, in this order:

1. `forge` of the first of these files that sets it to `"github"` or `"azure-devops"`:
   `skraft-config.local.json` at the repository root, then `skraft-config.json` at the
   repository root, then `~/.skraft/config.json`. A missing file, a missing key or `null` counts
   as unset. A value set there always wins.
2. Otherwise run `git remote`, take `origin` when it is listed, else the first name listed, and
   run `git remote get-url <that name>`: a host `dev.azure.com`, `ssh.dev.azure.com` or one
   ending in `.visualstudio.com` → `azure-devops`; any other host → `github`.
3. No remote listed → `github`.

`github` → load `github-issue-search` and follow it instead of this skill.

## Organization and project

Take both from the URL of the remote step 2 of the forge rule picks; never guess them, never read them from `az devops configure`
defaults, never change those defaults.

| Remote URL | Organization | Project |
|---|---|---|
| `https://[user@]dev.azure.com/{org}/{project}/_git/{repo}` | `{org}` | `{project}` |
| `git@ssh.dev.azure.com:v3/{org}/{project}/{repo}` | `{org}` | `{project}` |
| `https://{org}.visualstudio.com/[DefaultCollection/]{project}/_git/{repo}` | `{org}` | `{project}` |
| `{org}@vs-ssh.visualstudio.com:v3/{org}/{project}/{repo}` | `{org}` | `{project}` |

Decode `%20` and other escapes in the project name. The organization URL is
`https://dev.azure.com/{org}`. Pass the organization and the project explicitly in every call.
No remote, or a remote that matches no row → ask the developer for the organization and the
project once, then stop if no answer comes.

## Existing work item content is read-only

Never change `System.Title`, `System.Description`, `Microsoft.VSTS.TCM.ReproSteps` or
`Microsoft.VSTS.Common.AcceptanceCriteria` of an existing work item, through MCP, `az` or any
other transport. Never pass `--title`, `--description` or `--discussion` to
`az boards work-item update`. Put refinements, acceptance criteria and proposed wording in a
comment or a local artefact.

## Read GitHub words as Azure Boards words

Agent and skill instructions written for GitHub apply here with this mapping:

| GitHub | Azure Boards |
|---|---|
| issue, issue number | work item, work item ID |
| label (`type/…`, `priority/…`, `effort/…`, `status/…`) | tag with the same text in `System.Tags` |
| milestone | iteration path (`System.IterationPath`) of an iteration that already exists |
| sub-issue of a split story | child work item, `Parent` link to the original |
| `status/duplicate` and a link to the original | tag `status/duplicate` and a `Duplicate Of` link to the original |
| `related-to:#N` | `Related` link |
| open | state not in `Closed`, `Done`, `Removed` |

- Triage goes in tags only: never write Story Points, Effort, Size, Priority or Value Area,
  whose presence depends on the project's process.
- Never create an iteration or an area path. No existing iteration matches the milestone →
  report the assignment as pending, with the iterations you found.

## Route

Pick the route from what the host exposes, in this order, and keep it for the whole run:

| Host exposes | Route |
|---|---|
| Azure DevOps MCP tools of a server named `ado` (`mcp__ado__…` in Claude Code, `ado/…` in Copilot) | **MCP**: load [MCP routes](references/mcp-routes.md) |
| No such tool, or not the one the operation needs, and a terminal with `az` | **az**: load [az routes](references/az-routes.md); say "working through `az`" before the first call |
| Neither | Stop: keep the local artefact and report the read or write as pending, naming what is missing (the `ado` MCP server, or `az`, its `azure-devops` extension and a signed-in account) |

- A server the developer named otherwise (`ado-remote-mcp`…) is outside your tool filter: say
  so, and take the az route. Never widen a tool filter yourself.
- Never install a server or an extension, never run `az login`, `az devops login` or
  `az devops configure`, never print or store a token.
- An MCP call refused, unauthenticated or in error → re-read what it was meant to change
  (comments, tags, links); write once through `az` only when the change is absent.

## Discover work items

Cap every discovery at 20 work items. Rank: tag `priority/P0`, then `priority/P1`, then
`System.ChangedDate` newest first. Drop items tagged `status/wontfix`, `status/duplicate` or
`invalid`.

| Mode | Query |
|---|---|
| User-assigned (default) | Items assigned to you and open, newest change first |
| Artifact-driven | Up to 5 domain terms from recently changed files, matched in the title |
| Search-based | The tags, iteration or terms the developer gave |

Build the domain terms of the artifact-driven mode as `github-issue-search` describes for its
mode 2. The WIQL text and the MCP calls of each mode are in
[WIQL recipes](references/wiql-recipes.md).

## Write

- Comment: write the body to a file first and send that file's text unchanged, marker line
  included. Create a new comment; never edit another author's comment.
- Tags: read the current `System.Tags`, add yours, send the whole list (`a; b; c`): Azure
  Boards replaces the list with what it receives. Remove no tag.
- Create a work item only for a child of a split story, or for an item the developer named.
  Give a child the work item type of its parent.
- A failed or uncertain write is not repeated blind: re-read the comments, tags or links, and
  write again only when yours is absent. On HTTP 429, wait the `Retry-After` seconds (60 when
  absent) and retry once.
