from __future__ import annotations

import html
import json
import uuid
from typing import Any


def to_html(
    spec: Any,
    *,
    runtime_url: str = "/autk-runtime/dist/autk-runtime.js",
    height: str = "640px",
) -> str:
    spec_dict = spec.to_dict() if hasattr(spec, "to_dict") else spec
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
