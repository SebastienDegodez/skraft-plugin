using Eligibility.Domain;

namespace Eligibility.Application;

public sealed class EvaluateEligibility
{
    public EligibilityDecision For(int age) =>
        age >= 18 ? EligibilityDecision.Eligible : EligibilityDecision.NotEligible;
}
