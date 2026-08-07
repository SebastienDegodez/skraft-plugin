# Shared evaluation environments

Reusable workspaces for Vally agent and skill evaluations. Keep environments outside
individual suites so both `tests/agents/` and `tests/skills/` can stage the same source.

Each environment directory documents:

- target stack and architecture;
- available named states;
- expected baseline behavior;
- setup commands required before agent execution.

Eval specs reference state files relative to their own directory. Prefer explicit file
overlays over copying a whole state directory: local `bin/`, `obj/`, and result folders
must never leak into a prepared Vally workspace.

## Catalog

| Environment | State | Purpose |
|---|---|---|
| [checkout-pricing](checkout-pricing/README.md) | `approved-loyalty-discount-red` | .NET 10 Clean Architecture delivery workspace with an approved outer business RED and NetArchTest rules |