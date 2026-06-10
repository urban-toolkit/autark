from __future__ import annotations

import html
import json
import uuid
from typing import Any
from urllib.parse import urlparse

DEFAULT_RUNTIME_URL = "http://localhost:8000/autk-runtime/dist/autk-runtime.js"


def _script_safe_json(value: Any, **kwargs: Any) -> str:
    """Serialize to JSON that is safe to inline inside a <script> element."""
    return json.dumps(value, **kwargs).replace("</", "<\\/")


def _resolve_data_urls(spec_dict: dict[str, Any], runtime_url: str) -> dict[str, Any]:
    """Rewrite root-relative data URLs against the runtime server's origin.

    The page displaying the visualization (e.g. Jupyter on :8888) is usually a
    different origin than the server hosting the runtime and data (:8000), so
    URLs like ``/examples/data/foo.geojson`` would otherwise 404 against the
    page's own origin.
    """
    parsed = urlparse(runtime_url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return spec_dict
    origin = f"{parsed.scheme}://{parsed.netloc}"
    data = spec_dict.get("data")
    if not isinstance(data, list):
        return spec_dict
    rewritten = []
    changed = False
    for entry in data:
        url = entry.get("url") if isinstance(entry, dict) else None
        if isinstance(url, str) and url.startswith("/") and not url.startswith("//"):
            entry = {**entry, "url": f"{origin}{url}"}
            changed = True
        rewritten.append(entry)
    if not changed:
        return spec_dict
    return {**spec_dict, "data": rewritten}


def to_embedded_html(
    spec: Any,
    *,
    height: str = "640px",
    title: str | None = None,
) -> str:
    """Render a fully self-contained HTML document for a spec.

    The widget runtime bundle is inlined into the page and loaded through a
    blob: URL, so the file works standalone (file://, email attachment, web
    host) with no local server. DuckDB WebAssembly assets are fetched from the
    jsDelivr CDN on first load, so network access is required. Data sources
    must use absolute URLs or inline ``values``.

    @param spec: An AutarkSpec (or plain dict spec).
    @param height: CSS height of the visualization container.
    @param title: Page title; defaults to the spec's metadata title.
    @returns A complete HTML document as a string.
    """
    from .widget import _read_widget_esm, _warn_on_relative_urls

    spec_dict = spec.to_dict() if hasattr(spec, "to_dict") else spec
    _warn_on_relative_urls(spec_dict)
    bundle_source = _read_widget_esm()

    metadata = spec_dict.get("metadata")
    metadata_title = metadata.get("title") if isinstance(metadata, dict) else None
    page_title = html.escape(title or metadata_title or "Autark visualization")
    container_id = f"autark-{uuid.uuid4().hex}"

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{page_title}</title>
<style>
  body {{ margin: 0; font-family: sans-serif; }}
  #{container_id} {{ width: 100%; height: {height}; }}
</style>
</head>
<body>
<div id="{container_id}"></div>
<script type="module">
  const container = document.getElementById("{container_id}");
  try {{
    // The Autark widget runtime is inlined below and imported via a blob: URL.
    const source = {_script_safe_json(bundle_source)};
    const moduleUrl = URL.createObjectURL(new Blob([source], {{ type: "text/javascript" }}));
    const mod = await import(moduleUrl);
    URL.revokeObjectURL(moduleUrl);

    const values = new Map([
      ["spec", {_script_safe_json(spec_dict)}],
      ["height", {_script_safe_json(height)}],
    ]);
    const model = {{
      get: (name) => values.get(name),
      on: () => undefined,
      off: () => undefined,
    }};
    await mod.default.render({{ model, el: container }});
  }} catch (error) {{
    const pre = document.createElement("pre");
    pre.style.whiteSpace = "pre-wrap";
    pre.style.color = "#b00020";
    pre.textContent = error && error.stack ? error.stack : String(error);
    container.replaceChildren(pre);
  }}
</script>
</body>
</html>
"""


def to_html(
    spec: Any,
    *,
    runtime_url: str = DEFAULT_RUNTIME_URL,
    height: str = "640px",
) -> str:
    spec_dict = spec.to_dict() if hasattr(spec, "to_dict") else spec
    spec_dict = _resolve_data_urls(spec_dict, runtime_url)
    container_id = f"autark-{uuid.uuid4().hex}"
    json_spec = json.dumps(spec_dict)
    escaped_spec = html.escape(json.dumps(spec_dict, indent=2))
    return f"""<div id="{container_id}" style="width: 100%; height: {height};"></div>
<script type="module">
  import {{ AutarkRuntime }} from "{runtime_url}";
  const spec = {json_spec};
  const container = document.getElementById("{container_id}");
  AutarkRuntime.fromSpec(spec, {{ container }}).catch((error) => {{
    container.innerHTML = "<pre style='white-space: pre-wrap; color: #b00020;'></pre>";
    container.querySelector("pre").textContent = error && error.stack ? error.stack : String(error);
  }});
</script>
<details>
  <summary>Autark spec</summary>
  <pre>{escaped_spec}</pre>
</details>"""
