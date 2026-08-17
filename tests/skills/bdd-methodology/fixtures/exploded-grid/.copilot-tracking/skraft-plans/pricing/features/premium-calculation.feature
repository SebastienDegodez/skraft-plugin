Feature: Premium calculation

  @premium @happy-path
  Scenario: Premium for a City car in the North region
    Given a driver living in the North region
    And the insured vehicle is a City car
    When the yearly premium is calculated
    Then the yearly premium is 480 EUR

  @premium @happy-path
  Scenario: Premium for an Estate in the North region
    Given a driver living in the North region
    And the insured vehicle is an Estate
    When the yearly premium is calculated
    Then the yearly premium is 520 EUR

  @premium @happy-path
  Scenario: Premium for a Van in the North region
    Given a driver living in the North region
    And the insured vehicle is a Van
    When the yearly premium is calculated
    Then the yearly premium is 610 EUR

  @premium @happy-path
  Scenario: Premium for a City car in the South region
    Given a driver living in the South region
    And the insured vehicle is a City car
    When the yearly premium is calculated
    Then the yearly premium is 450 EUR

  @premium @happy-path
  Scenario: Premium for an Estate in the South region
    Given a driver living in the South region
    And the insured vehicle is an Estate
    When the yearly premium is calculated
    Then the yearly premium is 495 EUR

  @premium @happy-path
  Scenario: Premium for a Van in the South region
    Given a driver living in the South region
    And the insured vehicle is a Van
    When the yearly premium is calculated
    Then the yearly premium is 575 EUR

  @premium @happy-path
  Scenario: Premium for a City car in the East region
    Given a driver living in the East region
    And the insured vehicle is a City car
    When the yearly premium is calculated
    Then the yearly premium is 505 EUR

  @premium @happy-path
  Scenario: Premium for an Estate in the East region
    Given a driver living in the East region
    And the insured vehicle is an Estate
    When the yearly premium is calculated
    Then the yearly premium is 545 EUR

  @premium @happy-path
  Scenario: Premium for a Van in the East region
    Given a driver living in the East region
    And the insured vehicle is a Van
    When the yearly premium is calculated
    Then the yearly premium is 640 EUR

  @premium @happy-path
  Scenario: Premium for a City car in the West region
    Given a driver living in the West region
    And the insured vehicle is a City car
    When the yearly premium is calculated
    Then the yearly premium is 470 EUR

  @premium @happy-path
  Scenario: Premium for an Estate in the West region
    Given a driver living in the West region
    And the insured vehicle is an Estate
    When the yearly premium is calculated
    Then the yearly premium is 515 EUR
