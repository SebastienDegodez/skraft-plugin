---
title: RPI Review Profiles
description: Mandatory and optional SKRAFT skill loading for HVE RPI review agents
---

## Task Reviewer

### MANDATORY

* Load `adversarial-review-lenses` skill.
* Load `quality-gates-evidence-contract` skill.

### OPTIONAL

* When reviewing architecture: Load `architecture-review-criteria` skill.
* When reviewing Gherkin or test plans: Load `acceptance-review-criteria` skill.
* When reviewing mutation evidence: Load `mutation-testing` skill.
* When the repository is .NET: Load `quality-gates-dotnet` skill.

## RPI Validator

### MANDATORY

* Load `adversarial-review-lenses` skill.
* Load `architecture-review-criteria` skill.
* Load `acceptance-review-criteria` skill.

### OPTIONAL

* When validating delivery evidence: Load `quality-gates-evidence-contract` skill.
* When validating mutation evidence: Load `mutation-testing` skill.
* When the repository is .NET: Load `quality-gates-dotnet` skill.

## Implementation Validator

### MANDATORY

* Load `architecture-review-criteria` skill.

### OPTIONAL

* When reviewing Gherkin or test plans: Load `acceptance-review-criteria` skill.
* When validating delivery evidence: Load `quality-gates-evidence-contract` skill.
* When validating mutation evidence: Load `mutation-testing` skill.
* When the repository is .NET: Load `quality-gates-dotnet` skill.