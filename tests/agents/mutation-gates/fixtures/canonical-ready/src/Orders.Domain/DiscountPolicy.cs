namespace Orders.Domain;

public static class DiscountPolicy
{
    public static decimal Apply(decimal subtotal) => subtotal >= 100m ? subtotal * 0.9m : subtotal;
}