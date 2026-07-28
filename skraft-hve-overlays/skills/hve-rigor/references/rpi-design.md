---
title: RPI Design Profiles
description: Mandatory and optional SKRAFT skill loading for HVE RPI research and planning agents
---

## RPI Agent

### MANDATORY

* Apply this `hve-rigor` profile before direct work or subagent dispatch.

### OPTIONAL

* Before direct work, load the profile for the phase-specific HVE agent.

## Task Researcher

### MANDATORY

* Load `architecture-patterns` skill.

### OPTIONAL

* When research identifies a candidate architectural decision: Load `architecture-decisions` skill.
* Before drafting a candidate ADR: Load `adr-eligibility-gate` skill.

## Researcher Subagent

### MANDATORY

* Load `architecture-patterns` skill.

### OPTIONAL

* When research identifies a candidate architectural decision: Load `architecture-decisions` skill.
* Before drafting a candidate ADR: Load `adr-eligibility-gate` skill.

## Task Planner

### MANDATORY

* Load `architecture-patterns` skill.
* Load `architecture-decisions` skill.
* Load `adr-eligibility-gate` skill.
* Load `test-design-mandates` skill.
* Load `bdd-methodology` skill.

### OPTIONAL

* When resolving stack-specific layer placement: Load `clean-architecture-roster` skill.
* When an API or event contract is a planning boundary: Load `contract-testing` skill.

## Plan Validator

### MANDATORY

* Load `architecture-review-criteria` skill.
* Load `acceptance-review-criteria` skill.

### OPTIONAL

* When validating an API or event contract: Load `contract-testing` skill.