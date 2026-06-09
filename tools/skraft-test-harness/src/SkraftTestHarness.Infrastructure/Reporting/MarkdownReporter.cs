using System.Globalization;
using System.Text;
using SkraftTestHarness.Application.Gateways;
using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.Infrastructure.Reporting;

/// <summary>
/// Real <see cref="IReporter"/> adapter: writes the
/// <see cref="SkillVerdict"/> as a Markdown file named
/// <c>&lt;skill-id&gt;-&lt;UTC ISO no colons&gt;.md</c> into the
/// configured <see cref="ReportTarget"/>. Uses the Tell-Don't-Ask
/// <see cref="IVerdictRenderer"/> pushed by the Domain — no getters
/// were added on Domain types.
/// </summary>
public sealed class MarkdownReporter : IReporter
{
    private readonly ReportTarget _target;
    private readonly TimeProvider _clock;

    public MarkdownReporter(ReportTarget target, TimeProvider clock)
    {
        _target = target ?? throw new ArgumentNullException(nameof(target));
        _clock = clock ?? throw new ArgumentNullException(nameof(clock));
    }

    public async Task EmitAsync(SkillVerdict verdict, CancellationToken cancellationToken)
    {
        if (verdict is null) throw new ArgumentNullException(nameof(verdict));

        var writer = new MarkdownVerdictWriter();
        verdict.RenderTo(writer);

        var ts = _clock.GetUtcNow().ToString("yyyy-MM-ddTHHmmssZ", CultureInfo.InvariantCulture);
        var path = _target.ResolveFilePath($"{writer.SkillId}-{ts}.md");
        await File.WriteAllTextAsync(path, writer.Build(), cancellationToken);
    }

    private sealed class MarkdownVerdictWriter : IVerdictRenderer
    {
        private readonly List<(string Scenario, string Winner, string Reason)> _rows = new();

        internal string SkillId { get; private set; } = string.Empty;

        public void OnSkill(string skillId) => SkillId = skillId;

        public void OnScenarioVerdict(string scenarioName, string winner, string reason)
            => _rows.Add((scenarioName, winner, reason));

        internal string Build()
        {
            var sb = new StringBuilder();
            sb.AppendLine($"# {SkillId}");
            sb.AppendLine();
            sb.AppendLine("| Scenario | Winner | Reason |");
            sb.AppendLine("| --- | --- | --- |");
            foreach (var (scenario, winner, reason) in _rows)
                sb.AppendLine($"| {scenario} | {winner} | {reason} |");
            return sb.ToString();
        }
    }
}
