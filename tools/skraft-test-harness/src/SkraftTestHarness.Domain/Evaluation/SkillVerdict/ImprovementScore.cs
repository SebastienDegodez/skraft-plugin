using System.Globalization;

namespace SkraftTestHarness.Domain.Evaluation;

/// <summary>
/// Normalized improvement score in <c>[-1, +1]</c> produced by
/// collapsing a <see cref="ScenarioVerdicts"/> into a single number.
/// Value object — hides its wrapped <see cref="double"/> (no getter,
/// Object Calisthenics rule 9). Use <see cref="IsApproximately"/> to
/// probe the value with a tolerance; equality is structural on the
/// stored <see cref="double"/>.
/// </summary>
public sealed class ImprovementScore : IEquatable<ImprovementScore>
{
    private readonly double _value;

    public ImprovementScore(double value)
    {
        if (!double.IsFinite(value) || value < -1.0 || value > 1.0)
        {
            throw new ArgumentOutOfRangeException(
                nameof(value),
                value,
                "ImprovementScore must be a finite value in [-1, +1].");
        }
        _value = value;
    }

    /// <summary>
    /// Factory that derives an <see cref="ImprovementScore"/> from raw winner
    /// counts produced by <see cref="WinnerTally.ComputeImprovementScore"/>.
    /// Returns zero when <paramref name="total"/> is zero.
    /// </summary>
    public static ImprovementScore For(int withSkill, int baseline, int total)
        => total == 0
            ? new ImprovementScore(0.0)
            : new ImprovementScore((double)(withSkill - baseline) / total);

    public bool IsApproximately(double expected, double tolerance)
        => Math.Abs(_value - expected) <= tolerance;

    /// <summary>Returns <c>true</c> when this score meets or exceeds <paramref name="threshold"/>.</summary>
    public bool IsAbove(double threshold) => _value >= threshold;

    public bool Equals(ImprovementScore? other)
        => other is not null && _value.Equals(other._value);

    public override bool Equals(object? obj) => obj is ImprovementScore other && Equals(other);

    public override int GetHashCode() => _value.GetHashCode();

    public override string ToString() => _value.ToString("0.###", CultureInfo.InvariantCulture);
}
