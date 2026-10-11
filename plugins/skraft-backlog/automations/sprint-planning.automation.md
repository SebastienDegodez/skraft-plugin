---
version: 1
id: skraft-sprint-planning
name: Refine the proposed sprint
description: Refine the latest approved sprint proposal into ready stories.
schedule:
  kind: manual
---
Run the `Skraft - Backlog Planner` agent on the most recent triage report under
`.copilot-tracking/skraft-plans/`, refining every issue of its sprint proposal. Let it finish
its review gate, then list the stories marked ready and those left in refinement with their
failing Definition of Ready items.
