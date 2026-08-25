using Eligibility.Application;
using Eligibility.Domain;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddProblemDetails();
builder.Services.AddSingleton<EvaluateEligibility>();

var app = builder.Build();
app.UseStatusCodePages();

// The published contract for this endpoint lives in contracts/eligibility-openapi.yaml
// when the run stages it. This service is the PROVIDER: a contract test verifies
// that what is served here matches what the contract promises.
app.MapGet("/eligibility/{age:int}", (int age, EvaluateEligibility evaluate) =>
{
    if (age < 0)
    {
        return Results.Problem(
            title: "Age is out of range",
            detail: "Age must be zero or greater.",
            statusCode: StatusCodes.Status400BadRequest);
    }

    var decision = evaluate.For(age);
    return Results.Ok(new { age, eligible = decision == EligibilityDecision.Eligible });
});

app.Run();

public partial class Program;
