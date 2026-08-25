@loyalty-discount @happy-path
Feature: Loyalty discount quote

  Scenario Outline: Member receives the approved cart discount
    Given a cart subtotal of 100.00 EUR
    And the customer has <tier> loyalty status
    When the loyalty discount quote is calculated
    Then the discount is <discount> EUR
    And the payable total is <total> EUR

    Examples:
      | tier   | discount | total |
      | Bronze | 5.00     | 95.00 |
      | Silver | 10.00    | 90.00 |
      | Gold   | 15.00    | 85.00 |