---
version: 1
id: skraft-weekly-triage
name: Weekly backlog triage
description: Every Monday morning, triage the open issues assigned to you and propose the sprint.
schedule:
  kind: cron
  expression: "45 8 * * 1"
  timeZone: local
---
Run the `Skraft - Backlog Discoverer` agent on this workspace's GitHub repository, in its
default mode (the open issues assigned to me), with a capacity of 5 team-days unless the
previous sprint proposal states another figure. Let it finish its review gate, then give me
the sprint proposal's path, its verdict, and the issues it excluded for being above 8 points.
