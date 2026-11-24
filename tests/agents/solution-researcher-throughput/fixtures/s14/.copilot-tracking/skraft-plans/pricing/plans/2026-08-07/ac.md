<!-- markdownlint-disable-file -->
# Acceptance criteria — discount

Amounts are EUR in the criteria; the application carries them as integer cents. Percentages round down to the cent.

## AC-1 — Member receives the loyalty discount of their tier
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

## AC-2 — The loyalty discount never exceeds 20.00 EUR
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

## AC-3 — No loyalty discount under a 30.00 EUR subtotal
Given a cart subtotal of <subtotal> EUR
And the customer has Gold loyalty status
When the loyalty discount quote is calculated
Then the discount is <discount> EUR
And the payable total is <total> EUR

Examples:

| subtotal | discount | total |
| 29.99    | 0.00     | 29.99 |
| 30.00    | 4.50     | 25.50 |

## AC-4 — The WELCOME5 promo code takes 5.00 EUR off after the loyalty discount
Given a cart subtotal of <subtotal> EUR
And the customer has <tier> loyalty status
And the promo code WELCOME5 is applied
When the loyalty discount quote is calculated
Then the discount is <discount> EUR
And the payable total is <total> EUR

Examples:

| subtotal | tier   | discount | total |
| 100.00   | Silver | 15.00    | 85.00 |
| 20.00    | Bronze | 5.00     | 15.00 |

## AC-5 — The cap applies to the loyalty discount only, never to WELCOME5
Given a cart subtotal of <subtotal> EUR
And the customer has <tier> loyalty status
And the promo code WELCOME5 is applied
When the loyalty discount quote is calculated
Then the discount is <discount> EUR
And the payable total is <total> EUR

Examples:

| subtotal | tier   | discount | total  |
| 200.00   | Gold   | 25.00    | 175.00 |
| 300.00   | Silver | 25.00    | 275.00 |

## AC-6 — Promo codes ignore case
Given a cart subtotal of 100.00 EUR
And the customer has Silver loyalty status
And the promo code <code> is applied
When the loyalty discount quote is calculated
Then the discount is 15.00 EUR

Examples:

| code     |
| welcome5 |
| Welcome5 |

## AC-7 — The SUMMER10 promo code takes 10 % off what is left, at most 15.00 EUR
Given a cart subtotal of <subtotal> EUR
And the customer has <tier> loyalty status
And the promo code SUMMER10 is applied
When the loyalty discount quote is calculated
Then the discount is <discount> EUR
And the payable total is <total> EUR

Examples:

| subtotal | tier   | discount | total  |
| 100.00   | Silver | 19.00    | 81.00  |
| 300.00   | Bronze | 30.00    | 270.00 |
| 20.00    | Gold   | 2.00     | 18.00  |

## AC-8 — An unknown promo code is ignored
Given a cart subtotal of 100.00 EUR
And the customer has Silver loyalty status
And the promo code SPRING is applied
When the loyalty discount quote is calculated
Then the discount is 10.00 EUR
And the payable total is 90.00 EUR

## AC-9 — Platinum members receive a 20 % loyalty discount
Given a cart subtotal of <subtotal> EUR
And the customer has Platinum loyalty status
When the loyalty discount quote is calculated
Then the discount is <discount> EUR
And the payable total is <total> EUR

Examples:

| subtotal | discount | total  |
| 100.00   | 20.00    | 80.00  |
| 50.00    | 10.00    | 40.00  |
| 200.00   | 20.00    | 180.00 |

## AC-10 — The discount never exceeds the subtotal
Given a cart subtotal of <subtotal> EUR
And the customer has <tier> loyalty status
And the promo code WELCOME5 is applied
When the loyalty discount quote is calculated
Then the discount is <discount> EUR
And the payable total is 0.00 EUR

Examples:

| subtotal | tier   | discount |
| 4.00     | Bronze | 4.00     |
| 3.00     | Gold   | 3.00     |

## AC-11 — Standard shipping is free from 50.00 EUR payable
Given a payable total of <total> EUR
And the customer has <tier> loyalty status
When the standard shipping fee is calculated
Then the shipping fee is <fee> EUR

Examples:

| total | tier   | fee  |
| 49.99 | Bronze | 4.90 |
| 50.00 | Bronze | 0.00 |
| 49.99 | Silver | 4.90 |

## AC-12 — Gold and Platinum members never pay standard shipping
Given a payable total of 10.00 EUR
And the customer has <tier> loyalty status
When the standard shipping fee is calculated
Then the shipping fee is 0.00 EUR

Examples:

| tier     |
| Gold     |
| Platinum |

## AC-13 — Express shipping costs 9.90 EUR, free for Platinum members only
Given a payable total of <total> EUR
And the customer has <tier> loyalty status
When the express shipping fee is calculated
Then the shipping fee is <fee> EUR

Examples:

| total  | tier     | fee  |
| 100.00 | Bronze   | 9.90 |
| 10.00  | Gold     | 9.90 |
| 10.00  | Platinum | 0.00 |

## AC-14 — The checkout quote adds shipping to the payable total
Given a cart subtotal of <subtotal> EUR
And the customer has <tier> loyalty status
And the promo code <code> is applied
And <shipping> shipping is chosen
When the checkout is quoted
Then the payable total is <payable> EUR
And the shipping fee is <fee> EUR
And the checkout total is <total> EUR

Examples:

| subtotal | tier     | code     | shipping | payable | fee  | total  |
| 100.00   | Silver   | WELCOME5 | standard | 85.00   | 0.00 | 85.00  |
| 50.00    | Bronze   | none     | standard | 47.50   | 4.90 | 52.40  |
| 200.00   | Platinum | SUMMER10 | express  | 165.00  | 0.00 | 165.00 |
| 20.00    | Gold     | none     | express  | 20.00   | 9.90 | 29.90  |

## Ubiquitous language
- **Loyalty tier** — Bronze, Silver, Gold or Platinum: the standing a returning customer has earned.
- **Subtotal** — the cart amount before any discount.
- **Discount** — the loyalty part plus the promo code part, removed from the subtotal.
- **Payable total** — subtotal minus discount.
- **Shipping fee** — standard or express, charged on the payable total.
- **Checkout total** — payable total plus shipping fee.
