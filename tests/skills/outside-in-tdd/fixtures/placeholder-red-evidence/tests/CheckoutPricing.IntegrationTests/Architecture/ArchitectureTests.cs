using CheckoutPricing.Application;
using CheckoutPricing.Domain;

namespace CheckoutPricing.IntegrationTests.Architecture;

public sealed class CleanArchitectureDependencyTests
{
    [Fact]
    public void DomainHasNoDependencyOnOuterLayers()
    {
        var references = typeof(DomainMarker).Assembly.GetReferencedAssemblies();

        Assert.DoesNotContain(references, reference => reference.Name is "CheckoutPricing.Application" or "CheckoutPricing.Infrastructure" or "CheckoutPricing.Api");
    }

    [Fact]
    public void ApplicationHasNoDependencyOnOuterLayers()
    {
        var references = typeof(CalculatePayableTotal).Assembly.GetReferencedAssemblies();

        Assert.DoesNotContain(references, reference => reference.Name is "CheckoutPricing.Infrastructure" or "CheckoutPricing.Api");
    }
}
