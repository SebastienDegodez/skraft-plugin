namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// The output port through which a <see cref="SkillVerdict"/> is
/// serialised. Infrastructure adapters (e.g. the JSON reporter)
/// implement this interface, and the Domain pushes primitives at them
/// through <c>RenderTo</c>.
/// </summary>
public interface IVerdictRenderer
{
    void OnSkill(string skillId);

    void OnScenarioVerdict(string scenarioName, string winner, string reason);
}
