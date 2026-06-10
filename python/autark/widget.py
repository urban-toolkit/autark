"""anywidget-based Jupyter display for Autark specs.

Unlike :func:`autark.display.to_html` (which loads the runtime from a local
dev server), the widget ships a fully bundled runtime inside the Python
package, so it works in Jupyter, JupyterLab, VS Code, and Colab without any
local server. DuckDB WebAssembly assets are fetched from the jsDelivr CDN on
first use (network access required).

Note: because there is no local data server in this mode, data sources must
use absolute URLs or inline ``values``; root-relative URLs (``/examples/...``)
cannot be resolved.
"""

from __future__ import annotations

import warnings
from pathlib import Path
from typing import Any

_STATIC_DIR = Path(__file__).parent / "static"
_WIDGET_ESM = _STATIC_DIR / "autark-widget.js"

_widget_class: type | None = None


def _read_widget_esm() -> str:
    """Return the bundled widget runtime source, or raise with a build hint."""
    if not _WIDGET_ESM.exists():
        raise RuntimeError(
            f"Bundled widget runtime not found: {_WIDGET_ESM}. "
            "Build it with: cd autk-runtime && npm run build:widget"
        )
    return _WIDGET_ESM.read_text(encoding="utf-8")


def _build_widget_class() -> type:
    try:
        import anywidget
        import traitlets
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "The Autark widget requires anywidget. Install it with: pip install autark[widget]"
        ) from exc

    if not _WIDGET_ESM.exists():
        raise RuntimeError(
            f"Bundled widget runtime not found: {_WIDGET_ESM}. "
            "Build it with: cd autk-runtime && npm run build:widget"
        )

    class AutarkWidget(anywidget.AnyWidget):
        """Jupyter widget that renders an Autark spec with the bundled runtime."""

        _esm = _WIDGET_ESM
        spec = traitlets.Dict({}).tag(sync=True)
        height = traitlets.Unicode("640px").tag(sync=True)

    return AutarkWidget


def _warn_on_relative_urls(spec_dict: dict[str, Any]) -> None:
    data = spec_dict.get("data")
    if not isinstance(data, list):
        return
    for entry in data:
        url = entry.get("url") if isinstance(entry, dict) else None
        if isinstance(url, str) and url.startswith("/") and not url.startswith("//"):
            warnings.warn(
                f"Data source URL {url!r} is root-relative. The widget has no local "
                "server to resolve it against; use an absolute URL or inline values.",
                UserWarning,
                stacklevel=3,
            )


def create_widget(spec: Any, *, height: str = "640px") -> Any:
    """Create an anywidget instance rendering the given spec.

    @param spec: An AutarkSpec (or plain dict spec).
    @param height: CSS height of the widget container.
    @returns An ``anywidget.AnyWidget`` subclass instance; display it in a
        notebook cell or compose it with other ipywidgets.
    """
    global _widget_class
    if _widget_class is None:
        _widget_class = _build_widget_class()

    spec_dict = spec.to_dict() if hasattr(spec, "to_dict") else spec
    _warn_on_relative_urls(spec_dict)
    return _widget_class(spec=spec_dict, height=height)
