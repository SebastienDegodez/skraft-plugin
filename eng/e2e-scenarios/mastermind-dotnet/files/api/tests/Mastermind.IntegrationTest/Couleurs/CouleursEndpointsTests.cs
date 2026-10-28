using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Mastermind.IntegrationTest.Couleurs;

public sealed class CouleursEndpointsTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    [Fact]
    public async Task Get_couleurs_answers_the_colours_of_the_game()
    {
        var response = await factory.CreateClient().GetAsync("/api/couleurs");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("""{"couleurs":["rouge","jaune","vert","bleu","orange","violet"]}""", await response.Content.ReadAsStringAsync());
    }
}
