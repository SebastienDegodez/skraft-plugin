Feature: Loyalty tier discount at checkout

  Scenario Outline: A loyalty tier reduces the charged total
    Given a returning customer in the <tier> tier
    When a basket subtotal of 10000 cents is priced
    Then the customer is charged <charged> cents

    Examples:
      | tier   | charged |
      | Bronze | 9500    |
      | Silver | 9000    |
      | Gold   | 8500    |

  Scenario: The reduction lands on a whole cent in the customer's favour
    Given a returning customer in the Bronze tier
    When a basket subtotal of 7 cents is priced
    Then the customer is charged 7 cents
