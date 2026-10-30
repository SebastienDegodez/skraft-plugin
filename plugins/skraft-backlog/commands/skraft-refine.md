---
description: Review one GitHub issue or Azure Boards work item and post its refinement proposal as a comment — Definition of Ready, Fibonacci size, proposed story, domain examples, acceptance criteria, defects of the current criteria. Runs with your own model and credentials.
argument-hint: <issue number> [--force]
---

Refine GitHub issue or Azure Boards work item `$ARGUMENTS` of the current repository.

1. Load the `refinement-proposal` skill and follow it from step 1 for that number. On GitHub the
   repository is the one `gh repo view --json nameWithOwner` reports for the workspace; on Azure
   Boards the organization and project come from the remote, as `azure-boards-work-items` says.
2. Pass `--force` to its step 1 only when the arguments contain `--force`.
3. This is not a GitHub Agentic Workflows run: publish through the MCP route of the tracker
   skill, or its CLI route (`gh` on GitHub, `az` on Azure Boards).
4. No issue number in the arguments → ask for it and stop.
