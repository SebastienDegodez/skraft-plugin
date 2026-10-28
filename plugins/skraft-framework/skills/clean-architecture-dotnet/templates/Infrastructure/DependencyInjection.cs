using Microsoft.Extensions.DependencyInjection;

namespace [ProjectName].Infrastructure;

public static class DependencyInjection
{
    /// <summary>
    /// Registers each use case and the implementation of every interface Application calls out to.
    /// Add each one here when it is created, e.g. services.AddScoped&lt;BorrowBookUseCase&gt;();
    /// and services.AddScoped&lt;ILoanRepository, SqlLoanRepository&gt;();
    /// </summary>
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services)
    {
        return services;
    }
}
