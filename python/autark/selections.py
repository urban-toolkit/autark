from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from ._serialise import Serializable


@dataclass(frozen=True)
class Selection(Serializable):
    name: str
    type: Literal["point", "interval", "multi"]
    fields: list[str] | None = None


def point(name: str, fields: list[str] | None = None) -> Selection:
    return Selection(name=name, type="point", fields=fields)


def interval(name: str, fields: list[str] | None = None) -> Selection:
    return Selection(name=name, type="interval", fields=fields)


def multi(name: str, fields: list[str] | None = None) -> Selection:
    return Selection(name=name, type="multi", fields=fields)
