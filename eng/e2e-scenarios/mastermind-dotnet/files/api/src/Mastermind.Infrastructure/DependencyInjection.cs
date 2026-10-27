using Mastermind.Application.Couleurs;
using Microsoft.Extensions.DependencyInjection;

namespace Mastermind.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services) =>
        services.AddScoped<ListerCouleursUseCase>();
}
