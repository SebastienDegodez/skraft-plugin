Feature: Data-driven guardrail configuration
  As a SKRAFT framework maintainer
  I want the guardrail configuration to be derived from the agent descriptors
  So that the deterministic hooks always reflect the pipeline declared in the agents,
  with no hand-maintained duplication that can silently drift.

  Background:
    Given the orchestrator declares the phase order DISCOVER, DISCUSS, DESIGN, DISTILL, DELIVER
    And each pipeline phase has one specialist agent and one reviewer agent

  @config @happy-path
  Scenario: The generated configuration mirrors the declared phase order
    When the maintainer builds the guardrail configuration
    Then the configuration phase order matches the order the orchestrator declares

  @config @happy-path
  Scenario: Each phase pairs its specialist with its reviewer
    Given the DESIGN phase has specialist "solution-architect" and reviewer "solution-architect-reviewer"
    When the maintainer builds the guardrail configuration
    Then the DESIGN phase lists "solution-architect" as its specialist
    And the DESIGN phase lists "solution-architect-reviewer" as its reviewer

  @config @happy-path
  Scenario: An agent's mandatory skills are carried with a default verification policy
    Given the agent "solution-architect" declares the skills "architecture-patterns" and "architecture-decisions"
    When the maintainer builds the guardrail configuration
    Then the configuration records both skills for "solution-architect"
    And each recorded skill defaults to the "verify" enforcement policy

  @config @happy-path
  Scenario: An agent's expected artifacts are collected from its required inputs and outputs
    Given the agent "acceptance-designer" declares required inputs and produced outputs
    When the maintainer builds the guardrail configuration
    Then the configuration records the agent's required inputs and produced outputs as its expected artifacts

  @config @edge-case
  Scenario: An agent that declares no skills carries an empty skill set
    Given the agent "skraft-orchestrator" declares no enforceable skills for itself as a worker
    When the maintainer builds the guardrail configuration
    Then the configuration records an empty skill set for that agent without failing

  @config @guard @happy-path
  Scenario: The sync check passes when the committed configuration is up to date
    Given the committed guardrail configuration matches the agent descriptors
    When the maintainer runs the configuration sync check
    Then the check reports success

  @config @guard @error-case
  Scenario: The sync check fails when the committed configuration has drifted
    Given the committed guardrail configuration no longer matches the agent descriptors
    When the maintainer runs the configuration sync check
    Then the check reports a drift failure
    And it names the configuration as out of sync
