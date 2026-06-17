using System.ClientModel;
using OpenAI;
using OpenAI.Chat;
using SkraftTestHarness.Application.Gateways;
using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.Infrastructure.CopilotSdk;

/// <summary>
/// <see cref="IAgentRunner"/> adapter that calls the GitHub Models API
/// (https://models.inference.ai.azure.com) via <c>OpenAIClient</c> from
/// the <c>Azure.AI.OpenAI</c> package, using a GitHub token for
/// authentication. <see cref="RunMode"/> is ignored — the same
/// non-streaming chat-completion call is issued regardless.
/// </summary>
public sealed class CopilotSdkAgentRunner : IAgentRunner
{
    private const string Endpoint = "https://models.inference.ai.azure.com";

    private readonly string _token;
    private readonly string _model;

    public CopilotSdkAgentRunner(string token, string model = "gpt-4o")
    {
        _token = token ?? throw new ArgumentNullException(nameof(token));
        _model = model ?? throw new ArgumentNullException(nameof(model));
    }

    public async Task<AgentRunResult> RunAsync(Scenario scenario, RunMode mode, CancellationToken cancellationToken)
    {
        var prompt = ExtractPrompt(scenario);

        var client = new OpenAIClient(
            new ApiKeyCredential(_token),
            new OpenAIClientOptions { Endpoint = new Uri(Endpoint) });

        var chat = client.GetChatClient(_model);

        ChatCompletion response = await chat.CompleteChatAsync(
            [new UserChatMessage(prompt)],
            cancellationToken: cancellationToken);

        var content = response.Content[0].Text;

        return AgentRunResult.OutputOnly(new AgentOutput(content));
    }

    private static string ExtractPrompt(Scenario scenario)
    {
        var prompt = string.Empty;
        scenario.WithPrompt(p => prompt = p);
        return prompt;
    }
}
