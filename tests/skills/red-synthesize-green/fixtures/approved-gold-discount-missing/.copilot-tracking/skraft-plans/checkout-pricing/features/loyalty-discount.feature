Feature: Loyalty discount

  Scenario: Gold customer receives the approved discount
    Given a Gold customer has an order subtotal of 100.00
    When checkout calculates the payable total
    Then the payable total is 95.00
