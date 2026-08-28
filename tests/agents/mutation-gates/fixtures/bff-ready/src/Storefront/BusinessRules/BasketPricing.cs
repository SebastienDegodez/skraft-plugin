namespace Storefront.BusinessRules;

public static class BasketPricing
{
    public static decimal Total(decimal subtotal) => subtotal >= 100m ? subtotal - 10m : subtotal;
}