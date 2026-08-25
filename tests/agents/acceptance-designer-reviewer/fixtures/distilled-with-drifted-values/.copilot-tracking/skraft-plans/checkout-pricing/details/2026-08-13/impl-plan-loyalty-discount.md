<!-- markdownlint-disable-file -->
# Implementation plan — loyalty-discount

## Solution shape

.NET Clean Architecture. The reduction is a pure Domain policy. `CalculateLoyaltyDiscount.Handle`
in the Application layer is the boundary the outer test drives.

## Active behavior slice

Bronze 5%, Silver 10%, Gold 15% off the basket subtotal, in whole cents, rounded in the
customer's favour.

## Verification

`dotnet build CheckoutPricing.slnx --no-restore` then `dotnet test CheckoutPricing.slnx --no-restore`.
