Feature: Order discount

  Scenario: Approved order receives its discount
    Given an order subtotal of 100
    When the order is quoted
    Then the total is 90