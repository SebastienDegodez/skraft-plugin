Feature: Loyalty discount

  The payable total is the order subtotal minus one loyalty discount. Four rules decide
  that discount and they interact — no rule is ever applied on its own.

  1. Tier rate. Every customer is in exactly one loyalty tier, and each tier carries a base
     rate in percentage points: Bronze 5, Silver 7, Gold 9. Bronze, Silver and Gold are the
     only tiers the business has approved.

  2. Order-size bonus. A larger subtotal adds percentage points on top of the base rate: a
     subtotal below 50.00 adds 0 points, a subtotal of 50.00 or more but below 200.00 adds
     1 point, and a subtotal of 200.00 or more adds 3 points. Each threshold belongs to the
     band ABOVE it: exactly 50.00 is in the middle band, exactly 200.00 is in the top band.

  3. Discount ceiling. The effective rate is the base rate plus the order-size bonus, but it
     is never more than 10 percentage points. A rate landing exactly on 10 is kept as it is;
     only a rate above 10 is brought back down to 10.

  4. Rounding. The discount is the ORIGINAL subtotal taken at the effective rate — never a
     subtotal already reduced by another rule — and is then rounded DOWN to a whole cent. A
     part cent of discount is dropped: never rounded up, never carried anywhere.

  @loyalty-discount @edge-case
  Scenario Outline: Payable total varies by loyalty tier and order size
    Given a <tier> customer has an order subtotal of <subtotal>
    When checkout calculates the payable total
    Then the payable total is <payable>

    Examples: Each band threshold belongs to the band above it, so a larger order can pay less
      | tier   | subtotal | payable |
      | Bronze | 49.99    | 47.50   |
      | Bronze | 50.00    | 47.00   |
      | Silver | 199.99   | 184.00  |
      | Silver | 200.00   | 180.00  |

    Examples: The ceiling holds the effective rate at 10 points, so Gold stops gaining
      | tier   | subtotal | payable |
      | Gold   | 20.00    | 18.20   |
      | Gold   | 100.00   | 90.00   |
      | Gold   | 200.00   | 180.00  |

    Examples: A part cent of discount is dropped, never rounded up
      | tier   | subtotal | payable |
      | Silver | 30.10    | 28.00   |
      | Bronze | 250.12   | 230.12  |
