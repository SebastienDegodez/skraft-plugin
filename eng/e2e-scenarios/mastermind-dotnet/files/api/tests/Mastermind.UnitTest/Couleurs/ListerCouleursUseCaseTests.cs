using Mastermind.Application.Couleurs;

namespace Mastermind.UnitTest.Couleurs;

public sealed class ListerCouleursUseCaseTests
{
    [Fact]
    public void Gives_the_six_colours_of_the_game_in_their_order()
    {
        var couleurs = new ListerCouleursUseCase().Lister();

        Assert.Equal(["rouge", "jaune", "vert", "bleu", "orange", "violet"], couleurs.Couleurs);
    }
}
