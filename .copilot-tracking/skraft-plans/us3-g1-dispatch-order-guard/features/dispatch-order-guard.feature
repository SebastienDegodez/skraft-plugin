@dispatch-order-guard
Feature: Dispatch-order guard
  As a SKRAFT pipeline operator
  I want every agent dispatch validated against the recorded pipeline state before that agent starts
  So that the run can never silently skip a phase, run a reviewer before its specialist,
     or advance an unapproved phase — wasting tokens on drifted artefacts

  The guard decides at the dispatch boundary: an allowed dispatch lets the agent run,
  a blocked dispatch denies it and the agent never starts. Every decision is recorded.

  Background:
    Given the published phase order is DISCOVER, then DISCUSS, then DESIGN, then DISTILL, then DELIVER
    And each phase is handled first by its specialist and then by its reviewer
    And the retry budget is 3

  # ── AC-01 — the decision follows the recorded pipeline state (rule table) ──

  @ac-01 @happy-path
  Scenario Outline: A dispatch that matches the expected next agent is allowed
    Given the recorded pipeline state is phase <phase> with the specialist artefact <artefact>, reviewer verdict <verdict>, <retries> retries, and skipping <skipped>
    When the run requests dispatching <requested>
    Then the dispatch is allowed
    And the expected next agent is <expected>

    Examples:
      | row | phase   | artefact | verdict           | retries | skipped | requested           | expected            |
      | a   | DISCUSS | present  | APPROVED          | 0       | nothing | solution-architect  | solution-architect  |
      | e   | DISCUSS | present  | APPROVED          | 0       | DESIGN  | acceptance-designer | acceptance-designer |
      | f   | DISTILL | present  | CHANGES_REQUESTED | 1       | nothing | acceptance-designer | acceptance-designer |

  @ac-01 @edge-case
  Scenario Outline: A dispatch that does not match the expected next agent is denied and names it
    Given the recorded pipeline state is phase <phase> with the specialist artefact <artefact>, reviewer verdict <verdict>, <retries> retries, and skipping <skipped>
    When the run requests dispatching <requested>
    Then the dispatch is denied
    And the denied-dispatch outcome names the expected next agent <expected>

    Examples:
      | row | phase   | artefact | verdict           | retries | skipped | requested                   | expected           |
      | b   | DISCUSS | present  | APPROVED          | 0       | nothing | acceptance-designer         | solution-architect |
      | c   | DESIGN  | absent   | none              | 0       | nothing | solution-architect-reviewer | solution-architect |
      | d   | DISCUSS | present  | CHANGES_REQUESTED | 1       | nothing | solution-architect          | backlog-planner    |

  @ac-01 @error-case
  Scenario: A retry is blocked once the retry budget is exhausted
    Given the recorded pipeline state is phase DISTILL with the specialist artefact present, reviewer verdict CHANGES_REQUESTED, 3 retries, and skipping nothing
    When the run requests dispatching acceptance-designer
    Then the dispatch is blocked
    And the blocked-dispatch outcome signals that the retry budget is exhausted and the run must escalate

  # ── AC-02 — out-of-sequence dispatch is blocked before execution and names the expected agent ──

  @ac-02 @error-case
  Scenario: An out-of-sequence dispatch is blocked before the sub-agent runs
    Given the recorded pipeline state is phase DISCUSS with reviewer verdict APPROVED and 0 retries
    When the run requests dispatching acceptance-designer, skipping DESIGN
    Then the dispatch is denied before acceptance-designer starts
    And acceptance-designer produces no DISTILL artefact
    And the denied-dispatch outcome names the expected next agent solution-architect

  # ── AC-03 — deterministic decision, one audit fact per evaluation (on allow AND deny) ──

  @ac-03 @happy-path
  Scenario: The same dispatch against unchanged state yields the same decision both times
    Given the recorded pipeline state is phase DISCUSS with reviewer verdict APPROVED and 0 retries
    When the run requests dispatching solution-architect twice against that unchanged state
    Then both attempts are allowed
    And two dispatch-evaluation records are written, one per attempt

  @ac-03 @edge-case
  Scenario Outline: Every evaluation writes exactly one dispatch-evaluation record
    Given the recorded pipeline state is phase DISCUSS with reviewer verdict APPROVED and 0 retries
    When the run requests dispatching <requested>
    Then the dispatch is <decision>
    And exactly one dispatch-evaluation record is written capturing the requested agent, the expected agent, and the decision

    Examples:
      | requested           | decision |
      | solution-architect  | allowed  |
      | acceptance-designer | denied   |

  # ── AC-04 — fail-closed: state that cannot be trusted blocks, never allows ──

  @ac-04 @error-case
  Scenario Outline: The dispatch is blocked when the recorded state cannot be trusted
    Given the recorded pipeline state is <condition>
    When any dispatch is requested
    Then the dispatch is blocked
    And no sub-agent is started
    And the blocked-dispatch outcome reports the cause as <cause>
    And a dispatch-evaluation record captures the cause as <cause>

    Examples:
      | condition                                     | cause            |
      | missing                                       | unreadable-state |
      | truncated and unparseable                     | unreadable-state |
      | present but schema-invalid                    | invalid-state    |
      | recording a phase outside the published order | invalid-state    |
