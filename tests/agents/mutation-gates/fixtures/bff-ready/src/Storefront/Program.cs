using Storefront.BusinessRules;
using Storefront.DeliveryAdapters;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();
app.MapGet("/price/{subtotal:decimal}", (decimal subtotal) => new PriceResponse(BasketPricing.Total(subtotal)));
app.Run();