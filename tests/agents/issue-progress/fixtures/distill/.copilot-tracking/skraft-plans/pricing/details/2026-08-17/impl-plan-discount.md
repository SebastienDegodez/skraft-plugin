<!-- markdownlint-disable-file -->
# Implementation plan — discount

1. Domain: `LoyaltyDiscount.Apply(tier, subtotal)` returns the charged amount.
2. Application: `PriceBasket` resolves the tier and calls the Domain.
3. API: `POST /checkout/price` maps the request and response.
