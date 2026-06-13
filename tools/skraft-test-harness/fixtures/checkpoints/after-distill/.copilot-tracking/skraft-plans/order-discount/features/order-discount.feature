<!-- markdownlint-disable-file -->
Feature: Promotion stacking on order discount
  As a marketing manager
  I want an active store promotion to combine with the loyalty discount
  So that campaigns reward loyal customers within a safe cap

  Background:
    Given an order with a subtotal of 100.00

  Scenario: Loyalty discount only when no promotion is active
    Given the customer is in the "Gold" tier
    And no promotion is active
    When the payable total is computed
    Then the payable total is 95.00

  Scenario: Active promotion stacks on top of the loyalty discount
    Given the customer is in the "Gold" tier
    And an active promotion of 10% applies
    When the payable total is computed
    Then the payable total is 85.00

  Scenario: Combined discount is clamped to the cap
    Given the customer is in the "Platinum" tier
    And an active promotion of 15% applies
    And the discount cap is 20%
    When the payable total is computed
    Then the payable total is 80.00

  Scenario: Inactive promotion is ignored
    Given the customer is in the "Green" tier
    And an inactive promotion of 30% applies
    When the payable total is computed
    Then the payable total is 100.00
