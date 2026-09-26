Feature: Loyalty discount

  Agreed with the business on 2026-08-11. All amounts are whole cents.

  Scenario: A Standard member pays the full subtotal
    Given a Standard member has an order subtotal of 10000 cents
    When checkout calculates the payable total
    Then the payable total is 10000 cents

  Scenario: A Gold member pays ninety-five percent of the subtotal
    Given a Gold member has an order subtotal of 10000 cents
    When checkout calculates the payable total
    Then the payable total is 9500 cents

  Scenario: A Gold member keeps the remaining part cent
    Given a Gold member has an order subtotal of 4999 cents
    When checkout calculates the payable total
    Then the payable total is 4749 cents

  Scenario: A member whose Gold tier has lapsed pays as a Standard member
    Given a member whose Gold tier lapsed yesterday has an order subtotal of 10000 cents
    When checkout calculates the payable total
    Then the payable total is 10000 cents
