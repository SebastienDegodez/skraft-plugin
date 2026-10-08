# Issue write routes

Load before writing a comment or labels on an existing issue. Pick the route from the
tools the host actually exposes, in this order, and use one route for the whole run.

| Host exposes | Route |
|---|---|
| Safe-output tools (`add_comment`, `add_labels`) — a GitHub Agentic Workflows run | **Safe outputs** |
| A GitHub MCP server with comment and issue-update operations | **MCP** |
| Neither, and a terminal with `gh` | **gh** (announce it first) |
| None of the three | Stop: keep the local artefact and report the write as pending |

Every route obeys the [existing-issue content rule](../SKILL.md#existing-issue-content-is-read-only).

## Comment body

- Write the comment to a file first, then send that file's bytes unchanged. Keep every
  line, including an HTML marker such as `<!-- skraft-refine … -->` and the trailing newline.
- Create a new comment. Never edit another author's comment, never reply in a review
  thread, never put the text in the issue body.

## Safe outputs

The GitHub MCP server is read-only in this route and `gh` has no write token.

- Comment: call `add_comment` once with `body` set to the file content.
- Labels: call `add_labels` with only the labels to add; the workflow's allowlist decides
  which are accepted. Do not try to remove labels.
- Never call an MCP write operation or `gh` to write.

## MCP

Bind the installed operations from the host catalog; the names below are the official
GitHub MCP server's and may differ.

| Need | Operation |
|---|---|
| Comment | `add_issue_comment` with `owner`, `repo`, `issue_number`, `body` |
| Labels | `issue_write` (`update`) with the **full** label set: read the current labels with `issue_read`, append yours, send the union |
| Milestone | `issue_write` (`update`) with the milestone `number` |

## gh

Use only when no MCP server exposes the operation. Say "writing through `gh`" before the
first call. Never print a token, log in, or switch accounts.

```sh
gh issue comment "$number" --repo "$owner/$repo" --body-file "$comment_file"
gh issue edit "$number" --repo "$owner/$repo" --add-label "$label_1,$label_2"
gh issue edit "$number" --repo "$owner/$repo" --milestone "$milestone_title"
```

`--add-label` is additive. Quote every argument and pass `--repo` explicitly.

## Failure

A failed or uncertain write is not retried blind: list the issue's comments (or labels)
first, and write again only when yours is absent. On a 403 wait 60 seconds and retry once.
