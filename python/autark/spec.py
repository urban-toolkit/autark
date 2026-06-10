from __future__ import annotations

import json
from dataclasses import dataclass, field as dataclass_field
from pathlib import Path
from typing import Any

from ._serialise import Serializable, to_plain
from .display import to_html

SCHEMA_URL = "https://urban-toolkit.github.io/autark/schema/autark-spec-v0.1.json"
VERSION = "0.1"


@dataclass(frozen=True)
class Metadata(Serializable):
    title: str | None = None
    description: str | None = None
    authors: list[str] | None = None
    created: str | None = None


@dataclass(frozen=True)
class Workspace(Serializable):
    name: str | None = None
    coordinate_format: str | None = dataclass_field(default=None, metadata={"json": "coordinateFormat"})


@dataclass(frozen=True)
class AutarkSpec(Serializable):
    views: list[Serializable]
    data: list[Serializable] | None = None
    transforms: list[Serializable] | None = None
    links: list[Serializable] | None = None
    layout: Serializable | None = None
    metadata: Metadata | dict[str, Any] | None = None
    workspace: Workspace | dict[str, Any] | None = None

    def __post_init__(self) -> None:
        if not self.views:
            raise ValueError("AutarkSpec requires at least one view")

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "$schema": SCHEMA_URL,
            "version": VERSION,
        }
        optional = {
            "metadata": self.metadata,
            "workspace": self.workspace,
            "data": self.data,
            "transforms": self.transforms,
            "views": self.views,
            "links": self.links,
            "layout": self.layout,
        }
        for key, value in optional.items():
            plain = to_plain(value)
            if plain is not None and plain != [] and plain != {}:
                out[key] = plain
        return out

    def to_json(self, *, indent: int | None = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent)

    def save_json(self, path: str | Path, *, indent: int | None = 2) -> None:
        Path(path).write_text(self.to_json(indent=indent) + "\n", encoding="utf-8")

    def validate(self, schema_path: str | Path | None = None) -> None:
        try:
            import jsonschema
        except ModuleNotFoundError as exc:
            raise RuntimeError(
                "Install autark[validation] or jsonschema to validate Autark specs"
            ) from exc

        path = Path(schema_path) if schema_path is not None else _default_schema_path()
        if not path.exists():
            raise FileNotFoundError(f"Autark schema not found: {path}")
        schema = json.loads(path.read_text(encoding="utf-8"))
        jsonschema.Draft7Validator.check_schema(schema)
        jsonschema.validate(self.to_dict(), schema)

    def to_html(self, *, runtime_url: str = "http://localhost:8000/autk-runtime/dist/autk-runtime.js", height: str = "640px") -> str:
        return to_html(self, runtime_url=runtime_url, height=height)

    def save_html(
        self,
        path: str | Path,
        *,
        runtime_url: str = "http://localhost:8000/autk-runtime/dist/autk-runtime.js",
        height: str = "640px",
    ) -> None:
        Path(path).write_text(self.to_html(runtime_url=runtime_url, height=height), encoding="utf-8")

    def _repr_html_(self) -> str:
        return self.to_html()


def _default_schema_path() -> Path:
    return Path(__file__).resolve().parents[2] / "schema" / "autark-spec-v0.1.json"


Spec = AutarkSpec
