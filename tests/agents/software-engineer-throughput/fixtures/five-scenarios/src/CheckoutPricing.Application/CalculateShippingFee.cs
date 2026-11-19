using CheckoutPricing.Domain;

namespace CheckoutPricing.Application;

public sealed record CalculateShippingFeeQuery(int PayableTotalCents, LoyaltyTier LoyaltyTier);

public sealed class CalculateShippingFee
{
    public int Handle(CalculateShippingFeeQuery query) => 0;
}
