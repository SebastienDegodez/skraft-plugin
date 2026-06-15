using System.Text.Json;

namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Passes when a quality-gates evidence log
/// (<c>quality-gates-evidence-contract</c>, <c>qg-*.json</c>) matching
/// the <see cref="GlobPattern"/> attests the named <see cref="GateId"/>
/// with status <c>pass</c>. Reads the produced evidence from the
/// pre-resolved <see cref="WorkspaceView"/> and parses it — the gate is
/// proven, never trusted from prose. Malformed evidence never passes
/// silently.
/// </summary>
public sealed class QualityGatePassed : Assertion
{
    private readonly GlobPattern _evidence;
    private readonly GateId _gateId;

    public QualityGatePassed(GlobPattern evidence, GateId gateId)
    {
        _evidence = evidence ?? throw new ArgumentNullException(nameof(evidence));
        _gateId = gateId ?? throw new ArgumentNullException(nameof(gateId));
    }

    public override AssertionResult Evaluate(AgentRunResult runResult, WorkspaceView workspaceView)
    {
        ArgumentNullException.ThrowIfNull(workspaceView);
        var description = new AssertionDescription($"quality gate \"{_gateId}\" is attested as passed");
        if (workspaceView.AnyMatchedContent(_evidence, AttestsGatePassed))
            return new AssertionPassed(description);
        return new AssertionFailed(
            description,
            new FailureReason($"no evidence log matching '{_evidence}' attests gate '{_gateId}' with status 'pass'"));
    }

    internal override bool ChecksWorkspace => true;

    internal override void DeclareProbes(WorkspaceProbeRequests sink)
    {
        ArgumentNullException.ThrowIfNull(sink);
        sink.DeclareMatchedContent(_evidence);
    }

    private bool AttestsGatePassed(string evidenceJson)
    {
        var gateId = _gateId.ToString();
        try
        {
            using var document = JsonDocument.Parse(evidenceJson);
            if (!document.RootElement.TryGetProperty("gates", out var gates)
                || gates.ValueKind != JsonValueKind.Array)
            {
                return false;
            }

            foreach (var gate in gates.EnumerateArray())
            {
                if (gate.TryGetProperty("id", out var id)
                    && id.ValueKind == JsonValueKind.String
                    && string.Equals(id.GetString(), gateId, StringComparison.Ordinal)
                    && gate.TryGetProperty("status", out var status)
                    && status.ValueKind == JsonValueKind.String
                    && string.Equals(status.GetString(), "pass", StringComparison.Ordinal))
                {
                    return true;
                }
            }

            return false;
        }
        catch (JsonException)
        {
            return false;
        }
    }
}
