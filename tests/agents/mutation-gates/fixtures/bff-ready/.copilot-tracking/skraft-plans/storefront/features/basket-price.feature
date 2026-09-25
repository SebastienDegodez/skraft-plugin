Feature: Basket price

  Scenario: Basket price is returned
    Given a basket subtotal of 100
    When its price is requested
    Then the total is 90