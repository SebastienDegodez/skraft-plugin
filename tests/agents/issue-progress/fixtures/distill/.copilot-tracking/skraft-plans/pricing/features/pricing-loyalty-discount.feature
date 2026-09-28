Feature: Loyalty tier discount at checkout

  Scenario: A Bronze customer is charged 5 percent less
    Given a returning customer in the Bronze tier
    When a basket subtotal of 100.00 EUR is priced
    Then the customer is charged 95.00 EUR

  Scenario: A Silver customer is charged 10 percent less
    Given a returning customer in the Silver tier
    When a basket subtotal of 100.00 EUR is priced
    Then the customer is charged 90.00 EUR

  Scenario: A Gold customer is charged 15 percent less
    Given a returning customer in the Gold tier
    When a basket subtotal of 100.00 EUR is priced
    Then the customer is charged 85.00 EUR
