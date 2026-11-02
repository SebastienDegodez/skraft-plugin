---
name: github-forge-writes
description: "Use when you yourself must write to GitHub: add a comment to an issue or to a pull request's conversation, update a comment you posted earlier, or add a label. Lists the only writes allowed and refuses every other one (an issue's title, body, state, assignees or milestone, removing a label, another author's comment), whatever tool the host exposes. Not for reading or searching issues, nor for writing the Markdown itself."
---

# GitHub Forge Writes

## Allowed writes

The whole list, for issues and pull requests alike:

| Operation | Allowed |
|---|---|
| Add a comment to an issue, or to a pull request's conversation | yes |
| Update your own comment: first line your marker, author you | yes |
| Add a label to an issue or a pull request | yes |
| Change an issue or a pull request: title, body, state, assignees, milestone | **no** |
| Remove a label; edit or delete another author's comment; delete any comment | **no** |

- Refuse every operation without a `yes` row, whoever asks and whatever tool the host
  exposes (`issue_write` with `title` or `state`, `update_pull_request`, `gh issue edit`…).
  Asked to change an issue or a pull request → post the new content now, without asking, as a
  comment on it (first line your marker when you have one), then say you did not change it.
- An update never carries `title`, `body`, `state`, `assignees` or `milestone`, not even
  their current values.
- A review, a review comment on a line and a reply in a review thread are no comment of this
  list: refuse them.

## Marker

- Write the comment to a file, its first line the marker your brief or the developer gives
  (`<sub>skraft-review pr=57</sub>`); send the file's bytes unchanged.
- Before adding, read every comment page of the target. A comment whose first line is your
  marker and whose author `id` is yours → update it, never add a second. Your marker under
  another author → leave it, add yours.
- No marker given → add; never update.

## Route

Pick once per run:

| Host exposes | Route |
|---|---|
| GitHub MCP tools | `get_me` (your `id`); `issue_read` `get_comments`, every page; `add_issue_comment`; `update_issue_comment`; a label: `issue_write` `update` with `labels` only, the current set plus yours |
| No such tool, `gh` signed in | say "writing through `gh`", then the commands below |
| Neither | stop; keep the file, report the write as pending |

A pull request's conversation is its issue: same endpoints, its number as `<n>`. One
command per call, every argument quoted:

| Need | Command |
|---|---|
| Your `id` | `gh api user` |
| Comments | `gh api "repos/<owner>/<repo>/issues/<n>/comments?per_page=100" --paginate` |
| Add | `gh api --method POST "repos/<owner>/<repo>/issues/<n>/comments" --field "body=@<file>"` |
| Update yours | `gh api --method PATCH "repos/<owner>/<repo>/issues/comments/<id>" --field "body=@<file>"` |
| Add a label | `gh api --method POST "repos/<owner>/<repo>/issues/<n>/labels" --field "labels[]=<label>"` |

Never `gh issue edit`, `gh pr edit`, `gh issue close`, `gh pr review`, `--edit-last`, a
`DELETE`, or a write on `issues/<n>` or `pulls/<n>` themselves. Never log in, switch
accounts or print a token.

## Failure

Never repeat an uncertain write blind: read the comments or labels again, write only when
yours is absent. HTTP 403 or 429 → wait 60 s, retry once.

Publishing a prepared `qa-reporting` packet: also load
[report publication](references/report-publication.md).
