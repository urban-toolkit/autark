"""Executes the example notebooks end to end (kernel side only).

Verifies every cell runs without raising: spec construction, serialization,
HTML generation, and widget instantiation. Browser-side rendering is covered
separately by the Playwright suite.
"""

from __future__ import annotations

import unittest
from pathlib import Path

EXAMPLES_DIR = Path(__file__).resolve().parents[1] / "examples"


class NotebookExecutionTests(unittest.TestCase):
    def _execute(self, notebook_name: str) -> None:
        try:
            import nbformat
            from nbclient import NotebookClient
        except ModuleNotFoundError:
            self.skipTest("nbformat/nbclient not installed")
        try:
            import anywidget  # noqa: F401
        except ModuleNotFoundError:
            self.skipTest("anywidget not installed (widget cells would fail)")

        path = EXAMPLES_DIR / notebook_name
        nb = nbformat.read(path, as_version=4)
        client = NotebookClient(
            nb,
            timeout=120,
            kernel_name="python3",
            resources={"metadata": {"path": str(EXAMPLES_DIR)}},
        )
        client.execute()

    def test_jupyter_integration_notebook_executes(self) -> None:
        self._execute("test_jupyter_integration.ipynb")


if __name__ == "__main__":
    unittest.main()
