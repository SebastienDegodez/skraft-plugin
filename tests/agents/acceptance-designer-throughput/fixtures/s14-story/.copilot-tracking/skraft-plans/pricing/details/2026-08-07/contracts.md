<!-- markdownlint-disable-file -->
# Contracts — discount

## Solution shape

.NET 10 Clean Architecture. Domain depends on nothing; Application on Domain only;
Infrastructure on Application; the API composes Application and Infrastructure. Exactly two
test projects: `CheckoutPricing.UnitTest` (Domain + Application) and
`CheckoutPricing.IntegrationTest` (architecture and outer layers). Money is integer cents.

## Application boundaries

Every scenario enters through one of these signatures; keep them exactly.

- `CalculateLoyaltyDiscount.Handle(CalculateLoyaltyDiscountQuery)` with
  `CalculateLoyaltyDiscountQuery(int SubtotalCents, LoyaltyTier LoyaltyTier, string? PromoCode = null)`,
  returning `LoyaltyDiscountQuote(int SubtotalCents, int DiscountCents, int TotalCents, LoyaltyTier LoyaltyTier)`.
  The `PromoCode` parameter arrives with S4; S1 to S3 calls stay unchanged.
- `CalculateShippingFee.Handle(CalculateShippingFeeQuery)` with
  `CalculateShippingFeeQuery(int PayableTotalCents, LoyaltyTier LoyaltyTier, bool Express = false)`,
  returning the fee in cents as `int` (S11 to S13).
- `QuoteCheckout.Handle(QuoteCheckoutQuery)` with
  `QuoteCheckoutQuery(int SubtotalCents, LoyaltyTier LoyaltyTier, string? PromoCode, bool Express)`,
  returning `CheckoutQuote(int PayableCents, int ShippingCents, int TotalCents)` (S14).
- `LoyaltyTier` gains `Platinum` with S9.

## Observable outcomes

`LoyaltyDiscountQuote.DiscountCents` and `TotalCents`, the shipping fee in cents, and
`CheckoutQuote` are what the acceptance criteria talk about.
