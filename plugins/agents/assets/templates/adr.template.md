<!-- markdownlint-disable-file -->
---
adr: {{adr}}
title: {{title}}
status: {{status}}
chosen: {{chosen}}
decision: >
  {{decisionSummary}}
supersedes: {{#supersedes}}{{supersedes}}{{/supersedes}}{{^supersedes}}null{{/supersedes}}
date: {{date}}
ratified_by: {{ratifiedBy}}
---

# ADR-{{adr}} — {{title}}

**Date:** {{date}}
**Status:** {{status}}
**Deciders:** {{deciders}}
{{#supersedes}}**Supersedes:** {{supersedesLink}}
{{/supersedes}}
## Context
{{context}}

## Decision
{{decision}}

## Consequences
**Positive:**
{{#positive}}- {{.}}
{{/positive}}
**Negative:**
{{#negative}}- {{.}}
{{/negative}}
