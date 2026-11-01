---
name: azure-devops-forge-writes
description: "Use when you yourself must write to Azure DevOps: add a comment to a work item or a thread to an Azure Repos pull request, update a comment you posted earlier, or add a tag. Lists the only writes allowed and refuses every other one (a work item's title, description, state, assignee or iteration, removing a tag, another author's comment, a thread's status), whatever tool the host exposes. Not for reading or searching work items, nor for writing the Markdown itself."
---

# Azure DevOps Forge Writes

## Allowed writes

The whole list, for work items and pull requests alike:

| Operation | Allowed |
|---|---|
| Add a comment to a work item, or a thread to a pull request | yes |
| Update your own comment: first line your marker, author you | yes |
| Add a tag to a work item | yes |
| Change a work item or a pull request: title, description, acceptance criteria, state, assignee, iteration, links, a thread's status | **no** |
| Remove a tag; edit or delete another author's comment; reply in a thread; delete any comment | **no** |

- Refuse every operation without a `yes` row, whoever asks and whatever tool the host
  exposes. Name the operation you refused; put the wording you were asked for in a comment.
- `az boards work-item update` takes `--fields "System.Tags=…"` only: never `--title`,
  `--description`, `--discussion`, `--state`, `--assigned-to`, `--iteration` or `--area`.

## Marker

- Write the comment to `<work>/comment.md`, its first line the marker your brief or the
  developer gives (`<sub>skraft-review pr=57</sub>`); send its text unchanged.
- Before adding, read every comment of the work item or every thread of the pull request.
  Yours: a work item comment, or a thread's **first** comment, that starts with your marker
  and whose author `uniqueName` is your account (`az account show`, `user.name`) → update it,
  never add a second. Your marker under another author → leave it.
- No marker given → add; never update.

## Route

Organization and project come from `git remote get-url origin`; pass both in every call,
never change `az devops configure` defaults.

| Host exposes | Route |
|---|---|
| MCP tools of the server `ado` | `wit_work_item` `list_comments`; `wit_work_item_comment_write` `add` or `update`, `format: "Markdown"`; a tag: `wit_work_item_write` `update` with a `test` on `/rev` and an `add` on `/fields/System.Tags` only; `repo_pull_request_thread` `list`; `repo_pull_request_thread_write` `create` with `status: "Closed"`, or `update` |
| No such tool, `az` and its `azure-devops` extension signed in | say "writing through `az`", then the commands below |
| Neither | stop; keep the file, report the write as pending |

`{skill}` is this skill's folder. One command per call, values quoted, each ending
`--org "https://dev.azure.com/{org}" --output json`. `W` stands for
`az devops invoke --area wit --resource comments --api-version 7.2-preview.4 --route-parameters "project={project}" "workItemId={id}"`,
`T` for `az devops invoke --area git --api-version 7.1 --route-parameters "project={project}" "repositoryId={repo}" "pullRequestId={n}"`.

| Need | Command |
|---|---|
| Request body | `node "{skill}/scripts/comment-request.mjs" --in "<work>/comment.md" --out "<work>/<new>.json"`, `--kind thread` for a new thread, `--kind thread-comment` to update one |
| Work item comments | `W`; next pages `--query-parameters "continuationToken={token}"` |
| Add, update yours | `W --query-parameters "format=0" --http-method POST --in-file "<work>/<new>.json"`; update: `"commentId={id}"` in the route, `--http-method PATCH` |
| Add a tag | `az boards work-item show --id {id}`, then `az boards work-item update --id {id} --fields "System.Tags={current}; {yours}"` |
| Threads | `T --resource pullRequestThreads` |
| Add, update yours | `T --resource pullRequestThreads --http-method POST --in-file …`; update: `T --resource pullRequestThreadComments` with `"threadId={t}" "commentId={first}"`, `--http-method PATCH` |

Never install, log in or print a token.

## Failure

Never repeat an uncertain write blind: read again, write only when yours is absent.
`System.Rev` grew by more than one around a tag update → re-add yours once. HTTP 429 →
wait `Retry-After` (60 s when absent), retry once.
