<!-- markdownlint-disable-file -->
@g2-verify
Feature: G2 Skill Compliance Verification at SubagentStop
  As a SKRAFT pipeline operator
  I want agents that skipped a mandatory skill to be blocked and restarted
  So that no agent ever produces artefacts without its required domain knowledge

  # Domain example 2 — backlog-planner stops; sprint-planning read, issue-refinement NOT read → block
  # Domain example 3 — solution-architect stops; all skills read → allow
  # Domain example 7 — backlog-planner stops; transcript absent → allow (fail-open)

  @happy-path @ac-02
  Scenario: Solution architect is allowed when all mandatory skills were read
    # Domain example 3
    Given the framework config declares mandatory skills for "solution-architect":
      | skill-name              | policy |
      | architecture-decisions  | verify |
      | architecture-patterns   | verify |
    And the session transcript contains a read of "architecture-decisions" skill definition file
    And the session transcript contains a read of "architecture-patterns" skill definition file
    When solution-architect stops its session
    Then the hook returns allow
    And the compliance audit entry records decision "ALLOW" for agent "solution-architect"

  @error-case @ac-02
  Scenario: Backlog planner is blocked when issue-refinement was never read
    # Domain example 2 — only sprint-planning read, issue-refinement absent → block first missing
    Given the framework config declares mandatory skills for "backlog-planner":
      | skill-name       | policy |
      | issue-refinement | verify |
      | sprint-planning  | verify |
    And the session transcript contains a read of "sprint-planning" skill definition file
    And the session transcript does NOT contain a read of "issue-refinement" skill definition file
    When backlog-planner stops its session
    Then the hook returns block with message "Mandatory skill not loaded: issue-refinement"
    And the compliance audit entry records decision "BLOCK" for agent "backlog-planner"
    And the compliance audit entry names the missing skill "issue-refinement"

  @error-case @ac-02
  Scenario: Backlog planner is allowed when the session transcript is unavailable (fail-open)
    # Domain example 7 — transcript absent; ADR-006 fail-open: monitoring failure must not block agent
    Given the framework config declares mandatory skills for "backlog-planner":
      | skill-name       | policy |
      | issue-refinement | verify |
      | sprint-planning  | verify |
    And the session transcript is absent
    When backlog-planner stops its session
    Then the hook returns allow
    And the compliance audit entry records reason "transcript_unavailable"

  @edge-case @ac-02
  Scenario: Agent with no mandatory skills is always allowed at session stop
    Given the framework config declares no mandatory skills for "skraft-orchestrator"
    And the session transcript is empty
    When skraft-orchestrator stops its session
    Then the hook returns allow
