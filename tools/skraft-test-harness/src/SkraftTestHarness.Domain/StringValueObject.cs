namespace SkraftTestHarness.Domain;

/// <summary>
/// Base class for single-string value objects. Guards against empty
/// values and provides structural equality. Derived classes read the
/// wrapped string through <see cref="ToString"/>.
/// </summary>
public abstract class StringValueObject : IEquatable<StringValueObject>
{
    private readonly string _value;

    protected StringValueObject(string value, string argumentName)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new ArgumentException($"{argumentName} must not be empty.", argumentName);

        _value = value;
    }

    public sealed override string ToString() => _value;

    internal void WithValue(Action<string> use) => use(_value);

    public bool Equals(StringValueObject? other)
        => other is not null && GetType() == other.GetType() && _value == other._value;

    public sealed override bool Equals(object? obj) => obj is StringValueObject other && Equals(other);

    public sealed override int GetHashCode() => HashCode.Combine(GetType(), _value);
}
