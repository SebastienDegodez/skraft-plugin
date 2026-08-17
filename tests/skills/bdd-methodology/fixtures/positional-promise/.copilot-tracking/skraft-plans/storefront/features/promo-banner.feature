Feature: Storefront promotion banner

  @promo-banner @happy-path
  Scenario: Shopper reads the active promotion code
    Given a promotion is running with the code SPRING25
    When the shopper opens the storefront page
    Then the banner states the promotion code SPRING25
