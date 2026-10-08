from pathlib import Path
from typing import final


@final
class FileSystemReceiptStore:
    """Keeps one receipt file per reference under a root directory."""

    def __init__(self, root_directory: Path) -> None:
        self._root_directory = root_directory

    def save(self, reference: str, body: str) -> None:
        self._root_directory.mkdir(parents=True, exist_ok=True)
        (self._root_directory / f"{reference}.txt").write_text(body, encoding="utf-8")
