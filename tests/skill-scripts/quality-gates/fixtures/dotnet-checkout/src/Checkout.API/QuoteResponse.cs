using System.Globalization;

namespace Checkout.API;

public static class QuoteResponse
{
    public static string Format(decimal total) =>
        "Total: " + total.ToString("0.00", CultureInfo.InvariantCulture);
}
