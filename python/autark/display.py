from __future__ import annotations

import html
import json
import uuid
from typing import Any
from urllib.parse import urlparse


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


def to_html(
    spec: Any,
    *,
    runtime_url: str = "http://localhost:8000/autk-runtime/dist/autk-runtime.js",
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
