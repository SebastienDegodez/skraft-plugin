using Storefront.BusinessRules;

namespace Storefront.UnitTests;

public static class BasketPricingTests
{
    public static bool DiscountBoundaryIsCovered() => BasketPricing.Total(100m) == 90m;
}