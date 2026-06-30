<!-- markdownlint-disable-file -->
@g2-inject
Feature: G2 Skill Directive Injection at SubagentStart
  As a SKRAFT pipeline operator
  I want every agent to receive a clear directive listing its mandatory skills at the start of its session
  So that the agent loads its domain knowledge before producing any artefact

  # Domain example 1 — backlog-planner starts; skills: issue-refinement (verify), sprint-planning (verify)
  # Domain example 4 — acceptance-designer starts; bdd-methodology declared eager

  Background:
    Given the framework config declares mandatory skills for "backlog-planner":
      | skill-name       | policy |
      | issue-refinement | verify |
      | sprint-planning  | verify |
    And the framework config declares mandatory skills for "acceptance-designer":
      | skill-name          | policy |
      | bdd-methodology     | eager  |
      | test-design-mandates| verify |
      | outside-in-tdd      | verify |

  @happy-path @ac-01
  Scenario: Backlog planner receives a directive naming every mandatory skill at session start
    # Domain example 1
    When the backlog-planner starts its session
    Then the hook returns additionalContext
    And the context contains the phrase "The following skills are MANDATORY: issue-refinement, sprint-planning"

  @edge-case @ac-01
  Scenario: Agent with no mandatory skills declared in config receives allow at session start
    Given the framework config declares no mandatory skills for "skraft-orchestrator"
    When skraft-orchestrator starts its session
    Then the hook returns allow

  @happy-path @ac-03 @eager-mode
  Scenario: Acceptance designer receives the full SKILL.md content of an eager skill at session start
    # Domain example 4 — bdd-methodology policy 'eager' → content inlined in additionalContext
    Given the skill file for "bdd-methodology" contains "# BDD Methodology skill content"
    When acceptance-designer starts its session
    Then the hook returns additionalContext
    And the context includes the full content of the "bdd-methodology" skill definition file
    And the mandatory skill directive is also present in the context

  @error-case @ac-03 @eager-mode
  Scenario: Eager skill falls back to directive-only when the skill file cannot be read (fail-open)
    # ADR-006: fail-open — unreadable SKILL.md must not block the agent
    Given the skill file for "bdd-methodology" cannot be read
    When acceptance-designer starts its session
    Then the hook returns additionalContext
    And the mandatory skill directive is present in the context
    And an EagerReadFailed warning entry is recorded in the audit log for skill "bdd-methodology"
