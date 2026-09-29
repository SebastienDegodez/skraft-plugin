using System.Collections.Generic;
using Xunit;

namespace MyProject.UnitTest.Application.Orders.Queries;

/// <summary>
/// Template for testing Query Handlers.
///
/// Key points:
/// - No mocking library in the core: the repository is a small hand-written InMemory double
/// - Set up test data with real Domain objects
/// - Return ViewModels, never Domain objects
/// - Focus on mapping correctness
/// </summary>
public sealed class QueryHandlerTests
{
    [Fact]
    public async Task WhenQueryingExistingData_ShouldReturnViewModel()
    {
        // Arrange - Create real Domain object for setup
        var aggregate = Aggregate.Create(/* parameters */);
        // ... configure aggregate state ...

        var repository = new InMemoryRepository();
        repository.Items[aggregate.Id] = aggregate;

        var handler = new QueryHandler(repository);
        var query = new Query(aggregate.Id);

        // Act
        var result = await handler.Handle(query);

        // Assert - Verify ViewModel mapping
        Assert.NotNull(result);
        Assert.Equal(aggregate.Id, result.Id);
        Assert.Equal(aggregate.SomeProperty, result.SomeProperty);
    }

    [Fact]
    public async Task WhenQueryingNonExistingData_ShouldReturnNull()
    {
        // Arrange - empty InMemory repository
        var repository = new InMemoryRepository();

        var handler = new QueryHandler(repository);
        var query = new Query(Id.CreateNew());

        // Act
        var result = await handler.Handle(query);

        // Assert
        Assert.Null(result);
    }

    // Very simple InMemory double: a Dictionary behind the port interface.
    private sealed class InMemoryRepository : IRepository
    {
        public Dictionary<Id, Aggregate> Items { get; } = new();

        public Task<Aggregate?> GetByIdAsync(Id id, CancellationToken cancellationToken) =>
            Task.FromResult(Items.TryGetValue(id, out var found) ? found : null);
    }
}
