Feature: Loyalty discount
  As a returning customer
  I want my loyalty tier reflected in the checkout total
  So that the price I see rewards my history with the brand

  @happy-path
  Scenario Outline: A loyalty tier reduces the basket subtotal
    Given a returning customer in the <tier> tier
    When a basket subtotal of <subtotal> cents is priced
    Then the customer is charged <total> cents

    Examples:
      | tier   | subtotal | total |
      | Bronze | 10000    | 9500  |
      | Silver | 10000    | 9000  |
      | Gold   | 10000    | 8400  |
