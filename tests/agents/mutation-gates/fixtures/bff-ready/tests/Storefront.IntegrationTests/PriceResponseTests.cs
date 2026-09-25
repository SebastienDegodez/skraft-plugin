using Storefront.DeliveryAdapters;

namespace Storefront.IntegrationTests;

public static class PriceResponseTests
{
    public static bool AdapterReturnsTotal() => new PriceResponse(90m).Total == 90m;
}