using Mastermind.Application.Couleurs;

namespace Mastermind.Api.Couleurs;

public static class CouleursEndpoints
{
    public static IEndpointRouteBuilder MapCouleurs(this IEndpointRouteBuilder routes)
    {
        routes.MapGet("/api/couleurs", (ListerCouleursUseCase useCase) => useCase.Lister());
        return routes;
    }
}
