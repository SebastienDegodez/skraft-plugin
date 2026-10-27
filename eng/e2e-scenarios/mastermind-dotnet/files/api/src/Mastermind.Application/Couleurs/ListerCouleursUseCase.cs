using Mastermind.Domain.Couleurs;

namespace Mastermind.Application.Couleurs;

public sealed class ListerCouleursUseCase
{
    public CouleursViewModel Lister() => new(Couleur.DuJeu.Select(couleur => couleur.Nom).ToArray());
}
