Feature: Pay by card

  Scenario: A returning customer pays a basket with a valid card
    Given a returning customer with a valid card
    When a basket of 10000 cents is paid
    Then the payment is accepted for 10000 cents
