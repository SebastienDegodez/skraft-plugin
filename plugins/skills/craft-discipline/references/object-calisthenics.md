# Object Calisthenics — Reference

Calisthenics rules applied to Domain layer code in the skraft context.

## Verified Rules (G10)

### 1. One level of indentation per method
No nested `if` inside a `for` inside an `if`.
Extract to private methods or collaborating objects.

### 2. No `else` keyword
Use early return, polymorphism, or strategy pattern.

### 3. Wrap primitive types (in Domain)
A `string` is not a `PolicyNumber`. Create Value Objects.

### 4. First-class collections
A business collection deserves its own class. No exposed `List<T>`.

### 5. One dot per line (Law of Demeter)
`order.Customer.Address.City` → violation. Ask, don't dig.

### 6. No abbreviations
`CalcPrem()` → `CalculatePremium()`. Full names are free.

### 7. Keep entities small
Max ~50 effective lines per Domain class. Beyond that, extract.

### 8. No class with more than two instance attributes
Forces decomposition into Value Objects.

### 9. No public getters/setters on entities
Expose behaviors, not data. `entity.Apply(command)` > `entity.Status = x`.

## Out of Scope
These rules apply to the **Domain layer only**. DTOs, ViewModels,
and Infrastructure adapters are not subject to calisthenics.
