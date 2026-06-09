namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Tell-Don't-Ask escape hatch for serialising a <see cref="SkillVerdict"/>
/// without exposing its internal state through getters
/// (Object Calisthenics rule 9). Infrastructure adapters (e.g. the
/// JSON reporter) implement this interface and let the Domain push
/// primitives at them through <c>RenderTo</c>.
/// </summary>
public interface IVerdictRenderer
{
    void OnSkill(string skillId);

    void OnScenarioVerdict(string scenarioName, string winner, string reason);
}
