from __future__ import annotations

from dataclasses import dataclass, field as dataclass_field
from typing import Any, Literal

from ._serialise import Serializable


@dataclass(frozen=True)
class Scale(Serializable):
    type: Literal["linear", "quantile", "categorical"] | None = None
    scheme: str | None = None
    domain: list[Any] | None = None
    domain_strategy: Literal["minMax", "percentile", "user"] | None = dataclass_field(
        default=None,
        metadata={"json": "domainStrategy"},
    )


@dataclass(frozen=True)
class Field(Serializable):
    field: str
    scale: Scale | None = None


@dataclass(frozen=True)
class Value(Serializable):
    value: str | int | float | bool


@dataclass(frozen=True)
class Encoding(Serializable):
    color: Field | Value | None = None
    opacity: Field | Value | None = None
    size: Field | Value | None = None
    height: Field | Value | None = None


def field(name: str, scale: Scale | None = None) -> Field:
    return Field(field=name, scale=scale)


def value(raw: str | int | float | bool) -> Value:
    return Value(value=raw)
