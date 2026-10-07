namespace [ProjectName].Application.Shared;

/// <summary>
/// Handler for a command. Commands return nothing; the caller supplies any new id in the command.
/// </summary>
public interface ICommandHandler<in TCommand>
{
    Task HandleAsync(TCommand command, CancellationToken cancellationToken = default);
}
