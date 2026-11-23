# Placement example: a tiered rule

Approved: Gold customers get 10 % off orders of 100 or more, capped at 50. Tiers and a cap put the
rule on the last row of *Where the code lives*.

The use-case test enters through the handler, uses real Domain objects and a double only on the
repository:

```csharp
[Fact]
public async Task GoldCustomerOrderOf200_IsPayable180()
{
    var orders = new InMemoryOrderRepository();
    var handler = new PlaceOrderHandler(orders);

    var id = await handler.Handle(new PlaceOrder(CustomerTier.Gold, Total: 200m));

    Assert.Equal(180m, orders.Get(id).Payable);
}
```

The handler is written as a call to the Domain type that does not exist yet; that reference fails
to compile and authorizes the type:

```csharp
public async Task<OrderId> Handle(PlaceOrder command)
{
    var payable = new DiscountPolicy().Apply(command.Tier, command.Total);
    var order = Order.Place(command.Tier, command.Total, payable);
    await _orders.Add(order);
    return order.Id;
}
```

`DiscountPolicy` (Domain) holds the threshold, the rate and the cap. The handler holds none of
them, even before a Domain test exists.
