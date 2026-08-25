Feature: Claims intake

  @claims @api @happy-path
  Scenario: Intake accepts a claim inside the notification window
    Given a policyholder with an active motor policy
    When the client sends POST /api/v1/claims for an incident 5 days old
    Then the payload confirms the assessment takes 30 days

  @claims @backend @edge-case
  Scenario: Late notification is refused
    Given a policyholder with an active motor policy
    When the ClaimIntakeService is invoked for an incident 45 days old
    Then the ClaimRepository is left untouched
    And the caller is refused with the reason "outside the notification window"

  @claims @database @error-case
  Scenario: Settlement is stored for an approved claim
    Given an approved claim of 1200.00 EUR
    When the settlement job runs
    Then the payout row is written to the settlements table
    And the settlement DTO matches the payments schema

  @claims @happy-path
  Scenario: Policyholder with a clean driving record keeps the no-claims discount
    Given a policyholder with a clean driving record
    When the policyholder reports a first incident costing 300.00 EUR
    Then the no-claims discount is kept for the current year
