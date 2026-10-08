from importlinter.cli import lint_imports


def test_every_import_contract_holds() -> None:
    assert lint_imports() == 0
