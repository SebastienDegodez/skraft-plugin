using CheckoutPricing.Application;
using CheckoutPricing.Domain;
using CheckoutPricing.Infrastructure;
using NetArchTest.Rules;

namespace CheckoutPricing.IntegrationTest.Architecture;

public sealed class CleanArchitectureDependencyTests
{
    [Fact]
    public void DomainHasNoDependencyOnOuterLayers()
    {
        var applicationRule = Types.InAssembly(typeof(LoyaltyTier).Assembly)
            .ShouldNot()
            .HaveDependencyOn("CheckoutPricing.Application")
            .GetResult();
        var infrastructureRule = Types.InAssembly(typeof(LoyaltyTier).Assembly)
            .ShouldNot()
            .HaveDependencyOn("CheckoutPricing.Infrastructure")
            .GetResult();
        var apiRule = Types.InAssembly(typeof(LoyaltyTier).Assembly)
            .ShouldNot()
            .HaveDependencyOn("CheckoutPricing.Api")
            .GetResult();

        Assert.True(applicationRule.IsSuccessful);
        Assert.True(infrastructureRule.IsSuccessful);
        Assert.True(apiRule.IsSuccessful);
    }

    [Fact]
    public void ApplicationDependsOnDomainButNotOuterLayers()
    {
        var infrastructureRule = Types.InAssembly(typeof(CalculateLoyaltyDiscount).Assembly)
            .ShouldNot()
            .HaveDependencyOn("CheckoutPricing.Infrastructure")
            .GetResult();
        var apiRule = Types.InAssembly(typeof(CalculateLoyaltyDiscount).Assembly)
            .ShouldNot()
            .HaveDependencyOn("CheckoutPricing.Api")
            .GetResult();

        Assert.True(infrastructureRule.IsSuccessful);
        Assert.True(apiRule.IsSuccessful);
    }

    [Fact]
    public void InfrastructureHasNoDependencyOnApi()
    {
        var result = Types.InAssembly(typeof(InfrastructureMarker).Assembly)
            .ShouldNot()
            .HaveDependencyOn("CheckoutPricing.Api")
            .GetResult();

        Assert.True(result.IsSuccessful);
    }
}