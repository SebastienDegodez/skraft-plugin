<!-- markdownlint-disable-file -->
@g3-audit
Feature: G3 Skill Read Audit at PostToolUse Read
  As a SKRAFT pipeline operator
  I want every skill definition file read to be recorded as an immutable audit entry
  So that I can verify skill-loading compliance for any completed run

  # Domain example 5 — solution-architect reads architecture-decisions/SKILL.md → SkillRead entry
  # Domain example 6 — audit write fails (I/O error) → allow; agent not blocked
  # Domain example 8 — software-engineer reads src/app.mjs → no audit entry; allow

  @happy-path @ac-04
  Scenario: Solution architect reading a skill definition file produces a SkillRead audit entry
    # Domain example 5
    When solution-architect reads "plugins/skills/architecture-decisions/SKILL.md"
    Then the hook returns allow
    And the audit log contains exactly one SkillRead entry
    And the entry records agent "solution-architect"
    And the entry records skill name "architecture-decisions"
    And the entry records the full file path "plugins/skills/architecture-decisions/SKILL.md"
    And the entry records a timestamp

  @error-case @ac-04
  Scenario: Audit write failure does not block the agent (fail-open)
    # Domain example 6 — I/O error on audit write; ADR-006 fail-open
    Given the audit writer will fail on any write attempt
    When solution-architect reads "plugins/skills/architecture-decisions/SKILL.md"
    Then the hook returns allow

  @edge-case @ac-04
  Scenario: Reading a non-skill file produces no audit entry and returns allow immediately
    # Domain example 8 — path does not end with SKILL.md; skip immediately
    When software-engineer reads "src/application/pre-tool-use-service.mjs"
    Then the hook returns allow
    And the audit log is empty
