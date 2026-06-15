using System.Globalization;
using System.Xml.Linq;
using SkraftTestHarness.Application.Gateways;
using SkraftTestHarness.Domain.Evaluation;

namespace SkraftTestHarness.Infrastructure.Reporting;

/// <summary>
/// Real <see cref="IReporter"/> adapter: writes the
/// <see cref="SkillVerdict"/> as a JUnit-compatible XML file named
/// <c>&lt;skill-id&gt;-&lt;UTC ISO no colons&gt;.xml</c> into the
/// configured <see cref="ReportTarget"/>. Renders the verdict through
/// the <see cref="IVerdictRenderer"/> the Domain provides.
/// </summary>
public sealed class JUnitReporter : IReporter
{
    private readonly ReportTarget _target;
    private readonly TimeProvider _clock;

    public JUnitReporter(ReportTarget target, TimeProvider clock)
    {
        _target = target ?? throw new ArgumentNullException(nameof(target));
        _clock = clock ?? throw new ArgumentNullException(nameof(clock));
    }

    public Task EmitAsync(SkillVerdict verdict, CancellationToken cancellationToken)
    {
        if (verdict is null) throw new ArgumentNullException(nameof(verdict));

        var writer = new JUnitVerdictWriter();
        verdict.RenderTo(writer);

        var doc = writer.BuildDocument();
        var fileName = $"{writer.SkillId}-{Timestamp()}.xml";
        var path = _target.ResolveFilePath(fileName);

        doc.Save(path);
        return Task.CompletedTask;
    }

    private string Timestamp()
        => _clock.GetUtcNow().ToString("yyyy-MM-ddTHHmmssZ", CultureInfo.InvariantCulture);

    private sealed class JUnitVerdictWriter : IVerdictRenderer
    {
        private string _skillId = string.Empty;
        private readonly List<(string Name, string Winner, string Reason)> _scenarios = new();

        internal string SkillId => _skillId;

        public void OnSkill(string skillId) => _skillId = skillId;

        public void OnScenarioVerdict(string scenarioName, string winner, string reason)
            => _scenarios.Add((scenarioName, winner, reason));

        internal XDocument BuildDocument()
        {
            var testCases = _scenarios.Select(s =>
            {
                var testCase = new XElement("testcase",
                    new XAttribute("name", s.Name),
                    new XAttribute("classname", _skillId));

                if (s.Winner == "Baseline")
                    testCase.Add(new XElement("failure",
                        new XAttribute("message", "Baseline answer was preferred")));

                return testCase;
            });

            var testsuite = new XElement("testsuite",
                new XAttribute("name", _skillId),
                new XAttribute("tests", _scenarios.Count),
                testCases);

            return new XDocument(new XDeclaration("1.0", "utf-8", null), testsuite);
        }
    }
}
