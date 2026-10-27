using Mastermind.Api.Couleurs;
using Mastermind.Infrastructure;

var builder = WebApplication.CreateBuilder(args);
// The front end's dev server relays /api to this port; PORT moves it.
builder.WebHost.UseUrls($"http://127.0.0.1:{builder.Configuration["PORT"] ?? "3917"}");
builder.Services.AddInfrastructure();

var app = builder.Build();
app.MapCouleurs();
app.Run();
