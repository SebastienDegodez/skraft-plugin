---
description: Review one GitHub issue and post its refinement proposal as a comment — Definition of Ready, Fibonacci size, proposed story, domain examples, acceptance criteria, defects of the current criteria. Runs with your own model and credentials.
argument-hint: <issue number> [--force]
---

Refine GitHub issue `$ARGUMENTS` of the current repository.

1. Load the `refinement-proposal` skill and follow it from step 1 for that issue number. The
   repository is the one `gh repo view --json nameWithOwner` reports for the workspace.
2. Pass `--force` to its step 1 only when the arguments contain `--force`.
3. This is not a GitHub Agentic Workflows run: publish through the MCP or `gh` route of
   `github-issue-search`.
4. No issue number in the arguments → ask for it and stop.
