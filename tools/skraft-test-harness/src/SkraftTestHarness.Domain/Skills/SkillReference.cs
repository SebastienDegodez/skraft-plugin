namespace SkraftTestHarness.Domain.Skills;

/// <summary>
/// Lightweight reference to a skill by its directory name (the one
/// declared in the skill's frontmatter <c>name:</c>). Shared identifier
/// across bounded contexts — the Evaluation context attaches a
/// <see cref="SkillReference"/> to each verdict without reaching into
/// the SkillInventory aggregate.
/// </summary>
public sealed class SkillReference : StringValueObject
{
    public SkillReference(string value) : base(value, nameof(value)) { }
}
