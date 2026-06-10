"""Build guard: fail wheel/sdist builds if the widget runtime bundle is missing.

All package metadata lives in pyproject.toml; this file only ensures that
distributions cannot be built without ``autark/static/autark-widget.js``
(the bundled runtime that ``spec.widget()`` and ``save_html()`` depend on).
Build it with: cd autk-runtime && npm run build:widget
"""

from __future__ import annotations

from pathlib import Path

from setuptools import setup
from setuptools.command.build_py import build_py
from setuptools.command.sdist import sdist

WIDGET_BUNDLE = Path(__file__).parent / "autark" / "static" / "autark-widget.js"
HINT = (
    f"Widget runtime bundle missing: {WIDGET_BUNDLE}\n"
    "Build it first: cd autk-runtime && npm run build:widget"
)


def _require_bundle() -> None:
    if not WIDGET_BUNDLE.exists():
        raise RuntimeError(HINT)


class BuildPyWithBundle(build_py):
    def run(self) -> None:
        _require_bundle()
        super().run()


class SdistWithBundle(sdist):
    def run(self) -> None:
        _require_bundle()
        super().run()


setup(cmdclass={"build_py": BuildPyWithBundle, "sdist": SdistWithBundle})
