<!-- markdownlint-disable-file -->
Feature: Order checkout with loyalty discount
  As a customer
  I want my order total to reflect my loyalty tier's discount
  So that loyalty is rewarded automatically at checkout

  Background:
    Given an order with a subtotal of 100.00

  Scenario: Green tier pays the full subtotal
    Given the customer is in the "Green" tier
    When the payable total is computed
    Then the payable total is 100.00

  Scenario: Gold tier gets a 5% discount
    Given the customer is in the "Gold" tier
    When the payable total is computed
    Then the payable total is 95.00

  Scenario: Platinum tier gets a 10% discount
    Given the customer is in the "Platinum" tier
    When the payable total is computed
    Then the payable total is 90.00

  Scenario: An unknown order returns a 404 problem
    Given no order exists for the requested id
    When checkout is requested for that id
    Then the response status is 404
    And the response content type is "application/problem+json"
