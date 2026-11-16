# Architecture — quoting platform

## Bounded contexts

The platform has four bounded contexts. Each one is a package inside the existing modules;
none is a separate service or deployable.

| Context | Type | Lives in |
|---|---|---|
| Quoting | Core | `quoting-core` module, package `quoting` |
| Eligibility | Core | `quoting-core` module, package `eligibility` |
| Policy | Supporting | `policy-admin` module, package `policy` |
| Billing | Generic | `policy-admin` module, package `billing` |

A new capability joins the context whose language it speaks; it gets a context of its own only
when its language conflicts with every existing one.

## Relationships

See `docs/architecture/context-map.md`.

## Layers

Domain depends on nothing; Application depends on Domain; Infrastructure implements the
Application interfaces. Architecture tests enforce this for `quoting-core`; `policy-admin` is not
covered by them yet.
