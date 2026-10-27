namespace Mastermind.Domain.Couleurs;

/// <summary>Une couleur de pion ; le jeu n'en connaît que six.</summary>
public sealed record Couleur
{
    public static readonly IReadOnlyList<Couleur> DuJeu =
        new[] { new Couleur("rouge"), new Couleur("jaune"), new Couleur("vert"), new Couleur("bleu"), new Couleur("orange"), new Couleur("violet") };

    public string Nom { get; }

    private Couleur(string nom) => Nom = nom;
}
