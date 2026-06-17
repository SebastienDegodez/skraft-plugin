---
layout: doc
lang: en
title: "github-search-protocol"
description: "Use when building GitHub search queries, paginating through issue results, filtering by labels/milestones/assignees, ..."
persona: tech-lead
---

# github-search-protocol

> Structured protocol for discovering GitHub issues via three modes: user-assigned, artifact-driven, and search-based.

## When to use

- Building precise GitHub Search queries with 3–5 qualifiers
- Paginating through issue results, filtering by labels, milestones, assignees
- Implementing artifact-driven discovery from git history
- Discovering issues related to a code area currently being changed

## Entry contract

- Access to the `mcp_github_search_issues` MCP tool
- A discovery intent (mode 1, 2, or 3)
- For mode 2: recent git history (`git log --since="7 days ago"`)

## Exit contract

- Sorted and filtered issue list with fields: `number`, `title`, `labels`, `milestone`, `assignees`, `updated_at`
- Documented built query (qualifiers used)
- Pagination if `total_count` > `per_page`

## Invariants

- **Signal, not noise** — A well-formed query with 3–5 qualifiers outperforms a broad query with post-hoc filtering
- **Three modes** — User-assigned / Artifact-driven / Search-based — each mode has its own query pattern
- **Cap at 20 results** for triage quality
- **Domain keywords only** — Filter out infrastructure nouns (`Controller`, `Repository`, `Service`, `Handler`, `Test`) — these are plumbing, not domain signal

## Why this shape

Effective issue discovery relies on query precision, not result volume. In mode 2 (artifact-driven), keywords are extracted from modified file paths by applying PascalCase/camelCase heuristics, then filtered to retain only domain nouns — `Eligibility`, `Driver`, `Policy` — rather than technical terms.

> « The three modes address different discovery intents: what is mine to work on, what is related to what I am changing, and exploring a theme. »

## Allowed customisation

- Result cap threshold (default: 20)
- Infrastructure terms to exclude in mode 2 (L1)
- Result ranking heuristics (L2)

## See also

- [issue-triage]({{ "/en/reference/skills/issue-triage" | relative_url }}) — Classification and prioritisation of discovered issues
- [issue-refinement]({{ "/en/reference/skills/issue-refinement" | relative_url }}) — Transforming issues into INVEST user stories
- [backlog-discoverer]({{ "/en/reference/agents/backlog-discoverer" | relative_url }}) — Agent that activates this skill in the DISCOVER phase
