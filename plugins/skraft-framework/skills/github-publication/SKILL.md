---
name: github-publication
description: "Use when publishing already-prepared Markdown to a GitHub PR conversation or issue comment, updating that comment, or reconciling an interrupted publication. Covers MCP-first publication with host gh fallback when MCP capability is unavailable. Not for finding issues, authoring Markdown, generating reports or judging their content."
---

# GitHub Publication

## Existing issue content is read-only

Never change the `title` or `body` of an existing issue, through MCP, CLI or any
other transport, even when the installed tool exposes those fields. Omit both
fields from issue-update payloads; do not resend their current values.
Publish reports and proposed wording in comments or local artifacts instead. A
comment's `body` is distinct from the issue's `body`: only the selected comment may be
created or updated under the publication protocol.

## Publish

Load [GitHub publication](references/github-publication.md) and follow it to publish
prepared Markdown, update the selected comment, or reconcile an interrupted attempt.
Read every comment page; no search caps or ranking apply here.

Return authorship and approval to the owning producer: this skill transports prepared
content, never writes or regenerates it.
