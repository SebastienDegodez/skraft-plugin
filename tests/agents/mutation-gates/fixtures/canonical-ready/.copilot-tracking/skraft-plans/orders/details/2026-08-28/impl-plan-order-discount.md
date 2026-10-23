<!-- markdownlint-disable-file -->

# Order discount implementation plan

The order discount slice is implemented and its unit and integration tests are green.

| Step | Scenario | File | Test or class | Boundary | Double |
|---|---|---|---|---|---|
| 1 | Approved order receives its discount | `tests/Orders.UnitTests/QuoteOrderTests.cs` | `DiscountBoundaryIsCovered` | `QuoteOrder.Execute` | none |
| 2 | Approved order receives its discount | `src/Orders.Domain/DiscountPolicy.cs` | `DiscountPolicy.Apply` | `QuoteOrder.Execute` | none |
| 3 | Receipt of a quoted order | `tests/Orders.IntegrationTests/ReceiptStoreTests.cs` | `AdapterFormatsReceipt` | `OrderReceiptStore.Save` | none |
