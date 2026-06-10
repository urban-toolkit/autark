from __future__ import annotations

from dataclasses import fields, is_dataclass
from pathlib import Path
from typing import Any, Mapping


class Serializable:
    """Mixin for objects that serialize into an Autark JSON spec fragment."""

    def to_dict(self) -> dict[str, Any]:
        return to_plain(self)


def to_plain(value: Any) -> Any:
    if isinstance(value, Serializable) and type(value).to_dict is not Serializable.to_dict:
        return value.to_dict()
    if is_dataclass(value) and not isinstance(value, type):
        out: dict[str, Any] = {}
        for item in fields(value):
            key = item.metadata.get("json", item.name)
            raw = getattr(value, item.name)
            if raw is None:
                continue
            plain = to_plain(raw)
            if plain == {} or plain == []:
                continue
            out[key] = plain
        return out
    if isinstance(value, Serializable):
        return value.to_dict()
    if isinstance(value, Mapping):
        out: dict[str, Any] = {}
        for key, item in value.items():
            if item is None:
                continue
            plain = to_plain(item)
            if plain == {} or plain == []:
                continue
            out[str(key)] = plain
        return out
    if isinstance(value, (list, tuple)):
        return [to_plain(item) for item in value if item is not None]
    if isinstance(value, Path):
        return str(value)
    return value


def ref_name(value: Any) -> str:
    if isinstance(value, str):
        return value
    name = getattr(value, "name", None)
    if isinstance(name, str):
        return name
    raise TypeError(f"Expected a string name or object with a name, got {type(value).__name__}")


def exactly_one(label: str, first: Any, second: Any, first_name: str, second_name: str) -> None:
    has_first = first is not None
    has_second = second is not None
    if has_first == has_second:
        raise ValueError(f"{label} requires exactly one of {first_name} or {second_name}")
