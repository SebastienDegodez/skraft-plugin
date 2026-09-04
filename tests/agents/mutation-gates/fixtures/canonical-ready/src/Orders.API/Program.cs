using Orders.Application;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<QuoteOrder>();
var app = builder.Build();
app.MapGet("/quote/{subtotal:decimal}", (decimal subtotal, QuoteOrder quote) => quote.Execute(subtotal));
app.Run();