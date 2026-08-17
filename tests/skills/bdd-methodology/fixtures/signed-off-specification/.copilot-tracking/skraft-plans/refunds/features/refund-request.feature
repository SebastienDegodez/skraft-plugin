Feature: Refund request

  @refunds @happy-path
  Scenario: Shopper is refunded for an unopened item returned in time
    Given a shopper who bought an item for 60.00 EUR 10 days ago
    When the shopper returns the item unopened
    Then the shopper is refunded 60.00 EUR

  @refunds @edge-case
  Scenario: Shopper who asks after the return period keeps the item
    Given a shopper who bought an item for 60.00 EUR 40 days ago
    When the shopper asks to be refunded
    Then the refund is declined with the reason "the return period has passed"

  @refunds @error-case
  Scenario: The same purchase is not refunded twice
    Given a shopper who has already been refunded for a purchase
    When the shopper asks to be refunded for that same purchase
    Then the refund is declined with the reason "the purchase is already refunded"
