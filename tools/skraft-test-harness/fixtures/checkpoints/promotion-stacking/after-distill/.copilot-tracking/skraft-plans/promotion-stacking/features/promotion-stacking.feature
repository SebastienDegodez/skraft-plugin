<!-- markdownlint-disable-file -->
Feature: Promotion stacking on order checkout
  As a marketing manager
  I want an active store promotion to combine with the loyalty discount
  So that campaigns reward loyal customers within a safe cap

  Background:
    Given an order with a subtotal of 100.00
    And the Promotions API is mocked with Microcks

  Scenario: Loyalty discount only when no promotion is active
    Given the customer is in the "Gold" tier
    And the Promotions API returns no active promotion
    When the payable total is computed
    Then the payable total is 95.00

  Scenario: Active promotion stacks on top of the loyalty discount
    Given the customer is in the "Gold" tier
    And the Promotions API returns an active promotion of 10%
    When the payable total is computed
    Then the payable total is 85.00

  Scenario: Combined discount is clamped to the cap
    Given the customer is in the "Platinum" tier
    And the Promotions API returns an active promotion of 15%
    And the discount cap is 20%
    When the payable total is computed
    Then the payable total is 80.00
