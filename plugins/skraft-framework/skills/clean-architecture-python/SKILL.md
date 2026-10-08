---
name: clean-architecture-python
description: Use when laying out a Python service packaged with pyproject.toml (FastAPI or another web framework), or adding a feature, endpoint, use case, aggregate or repository to one — which package a module belongs in, which package may import which, and how an endpoint reaches a use case. Not for configuration, dependency or tooling changes.
---

# Clean Architecture — Python

The layer rules are those of `architecture-patterns`. This skill maps them onto Python packages.

## One package per layer

| Package | Holds | May import |
|---|---|---|
| `<context>.domain` | aggregates, value objects, domain events | the standard library only |
| `<context>.application` | use cases and the `Protocol`s they call | `<context>.domain` |
| `<context>.infrastructure` | implementations of those `Protocol`s (SQLAlchemy, HTTP clients, files) | `<context>.application`, `<context>.domain` |
| `<context>.api` | routes, the app factory, the wiring of every class | all three |

- Lay out `src/<context>/` with one sub-package per layer, in a single `pyproject.toml`. A new feature goes into the existing layer packages, never into a new top-level package.
- FastAPI, Pydantic, SQLAlchemy and HTTP clients are imported only in `infrastructure` and `api`. Domain and application use `dataclasses` and `typing`.
- ORM models and their mapping live in `infrastructure`; never make a domain class an ORM or Pydantic model.
- Tests live in the two test packages `clean-architecture-testing` defines, never inside `src/`.

## Use cases

- A use case is a class named after the action (`BorrowBook`) with one public method. The route calls it directly: no `Protocol` or ABC in front of it, no `*Service` implementation.
- A command method returns `None`; the caller creates the new id and passes it in. A query returns a frozen `*ViewModel` dataclass defined in `application`, never a domain object.
- Application declares a `Protocol` only where it calls out (repository, gateway). A repository `Protocol` sits in `domain` when it persists an aggregate, in `application` otherwise.
- Who may *read* a resource is checked in the use case. Who may *change* it is an aggregate rule: the mutation method takes the caller's id and raises.
- Wire every class by hand in `api` (one composition module); FastAPI `Depends` appears only in `api`. No DI container.
- One transaction per use-case call, opened and committed in `api` around the call.
- Inside each layer, one sub-package per feature (`application/loans/borrow_book.py`, `infrastructure/loans/sql_loan_repository.py`), never a module at the layer root or a technical package (`repositories`, `services`, `models`). A feature imports no other feature; what two features use moves to a `shared` sub-package of that layer.
- No `ports` or `adapters` package, and no "port" in module, class or docstring.

## Domain

- An aggregate is created through a `classmethod` factory; code outside `domain` never calls the class itself. It is identified by a typed id (`OrderId`, a frozen dataclass or `NewType`), never a raw `str`, `int` or `UUID`.

## Guard

Declare the graph in `pyproject.toml` and add `import-linter` to the dev dependencies; the architecture test of `clean-architecture-testing` runs `lint-imports`:

```toml
[tool.importlinter]
root_package = "<context>"
include_external_packages = true

[[tool.importlinter.contracts]]
name = "Layers import inward only"
type = "layers"
layers = ["<context>.api", "<context>.infrastructure", "<context>.application", "<context>.domain"]

[[tool.importlinter.contracts]]
name = "Domain and application import no framework"
type = "forbidden"
source_modules = ["<context>.domain", "<context>.application"]
forbidden_modules = ["fastapi", "starlette", "pydantic", "sqlalchemy", "httpx"]

[[tool.importlinter.contracts]]
name = "Application features never import each other"
type = "independence"
modules = ["<context>.application.*"]
ignore_imports = ["<context>.application.** -> <context>.application.shared.**"]
unmatched_ignore_imports_alerting = "none"
```
