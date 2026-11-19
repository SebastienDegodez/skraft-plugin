@discount
Feature: Checkout pricing quote

  Scenario Outline: S1 - Member receives the loyalty discount of their tier
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

  Scenario Outline: S2 - The loyalty discount never exceeds 20.00 EUR
    Given a cart subtotal of <subtotal> EUR
    And the customer has <tier> loyalty status
    When the loyalty discount quote is calculated
    Then the discount is <discount> EUR
    And the payable total is <total> EUR

    Examples:
      | subtotal | tier   | discount | total  |
      | 200.00   | Gold   | 20.00    | 180.00 |
      | 300.00   | Silver | 20.00    | 280.00 |
      | 120.00   | Gold   | 18.00    | 102.00 |

  Scenario Outline: S3 - No loyalty discount under a 30.00 EUR subtotal
    Given a cart subtotal of <subtotal> EUR
    And the customer has Gold loyalty status
    When the loyalty discount quote is calculated
    Then the discount is <discount> EUR
    And the payable total is <total> EUR

    Examples:
      | subtotal | discount | total |
      | 29.99    | 0.00     | 29.99 |
      | 30.00    | 4.50     | 25.50 |

  Scenario Outline: S4 - The WELCOME5 promo code takes 5.00 EUR off after the loyalty discount
    Given a cart subtotal of <subtotal> EUR
    And the customer has <tier> loyalty status
    And the promo code <code> is applied
    When the loyalty discount quote is calculated
    Then the discount is <discount> EUR
    And the payable total is <total> EUR

    Examples:
      | subtotal | tier   | code     | discount | total  |
      | 100.00   | Silver | WELCOME5 | 15.00    | 85.00  |
      | 200.00   | Gold   | WELCOME5 | 25.00    | 175.00 |
      | 20.00    | Bronze | WELCOME5 | 5.00     | 15.00  |
      | 100.00   | Silver | SUMMER   | 10.00    | 90.00  |

  Scenario Outline: S5 - Shipping is free from 50.00 EUR payable and always for Gold members
    Given a payable total of <total> EUR
    And the customer has <tier> loyalty status
    When the shipping fee is calculated
    Then the shipping fee is <fee> EUR

    Examples:
      | total | tier   | fee  |
      | 49.99 | Bronze | 4.90 |
      | 50.00 | Bronze | 0.00 |
      | 49.99 | Silver | 4.90 |
      | 10.00 | Gold   | 0.00 |
