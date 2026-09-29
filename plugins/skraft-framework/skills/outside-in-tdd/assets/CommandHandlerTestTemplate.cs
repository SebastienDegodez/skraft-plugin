using System.Collections.Generic;
using System.Linq;
using Xunit;

namespace MyProject.UnitTest.Application.Orders.Commands;

/// <summary>
/// Template for testing Command Handlers with sociable testing approach.
///
/// Key points:
/// - No mocking library in the core: replace output gateways with a small hand-written
///   InMemory double (Dictionary/List behind the port interface)
/// - Use real Domain objects (aggregates, entities, value objects)
/// - Assert on the observable state of the InMemory double or on the use-case result
///   (no behaviour verification such as MustHaveHappened / Verify)
/// - Test business rules through actual Domain methods
/// - Shared doubles may live in the non-test TestKit project
/// </summary>
public sealed class CommandHandlerTests
{
    [Fact]
    public async Task WhenExecutingValidCommand_ShouldSucceed()
    {
        // Arrange - InMemory doubles for output gateways only
        var repository = new InMemoryRepository();
        var externalService = new InMemoryExternalService();
        var handler = new CommandHandler(repository, externalService);

        var command = new Command(/* parameters */);

        // Act - Use real Domain objects internally
        var result = await handler.Handle(command);

        // Assert - Observable state of the InMemory double
        var saved = Assert.Single(repository.Saved.Values);
        Assert.Equal(command.Id, saved.Id);
        Assert.Equal(expectedValue, saved.SomeProperty);
    }

    [Fact]
    public async Task WhenExecutingInvalidCommand_ShouldThrowDomainException()
    {
        // Arrange
        var repository = new InMemoryRepository();
        var externalService = new InMemoryExternalService();
        var handler = new CommandHandler(repository, externalService);

        var invalidCommand = new Command(/* invalid parameters */);

        // Act & Assert - Domain validation triggers
        await Assert.ThrowsAsync<DomainException>(
            () => handler.Handle(invalidCommand)
        );

        // Nothing was stored on validation failure
        Assert.Empty(repository.Saved);
    }

    // Very simple InMemory double: a Dictionary behind the port interface.
    private sealed class InMemoryRepository : IRepository
    {
        public Dictionary<Id, Aggregate> Saved { get; } = new();

        public Task AddAsync(Aggregate aggregate, CancellationToken cancellationToken)
        {
            Saved[aggregate.Id] = aggregate;
            return Task.CompletedTask;
        }
    }

    private sealed class InMemoryExternalService : IExternalService
    {
        // Record what the test needs to observe (e.g. published events) in a List.
    }
}
