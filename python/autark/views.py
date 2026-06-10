from __future__ import annotations

from dataclasses import dataclass, field as dataclass_field, replace
from typing import Any, Literal

from ._serialise import Serializable, ref_name, to_plain
from .encodings import Encoding, Field, Scale, Value, field, value
from .selections import Selection


@dataclass(frozen=True)
class Camera(Serializable):
    pitch: float | None = None
    bearing: float | None = None
    zoom: float | None = None


@dataclass(frozen=True)
class Layer(Serializable):
    source: object
    id: str | None = None
    type: Literal["buildings", "roads", "polygons", "polylines", "points"] | None = None
    encoding: Encoding | None = None
    style_values: dict[str, Any] | None = dataclass_field(default=None, metadata={"json": "style"})

    def encode(
        self,
        *,
        color: Field | Value | str | int | float | bool | None = None,
        opacity: Field | Value | int | float | bool | None = None,
        size: Field | Value | int | float | bool | None = None,
        height: Field | Value | str | int | float | bool | None = None,
    ) -> "Layer":
        return replace(
            self,
            encoding=Encoding(
                color=_encoding_channel(color),
                opacity=_encoding_channel(opacity),
                size=_encoding_channel(size),
                height=_encoding_channel(height),
            ),
        )

    def style(self, **values: Any) -> "Layer":
        merged = dict(self.style_values or {})
        merged.update(values)
        return replace(self, style_values=merged)

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"source": ref_name(self.source)}
        if self.id is not None:
            out["id"] = self.id
        if self.type is not None:
            out["type"] = self.type
        if self.encoding is not None:
            out["encoding"] = self.encoding.to_dict()
        if self.style_values:
            out["style"] = to_plain(self.style_values)
        return out


def _encoding_channel(value_: Field | Value | str | int | float | bool | None) -> Field | Value | None:
    if value_ is None:
        return None
    if isinstance(value_, (Field, Value)):
        return value_
    if isinstance(value_, str):
        return field(value_)
    return value(value_)


@dataclass(frozen=True)
class Map(Serializable):
    layers: list[Layer]
    name: str | None = None
    camera: Camera | None = None
    style: dict[str, Any] | None = None
    type: Literal["map"] = "map"

    def __post_init__(self) -> None:
        if not self.layers:
            raise ValueError("Map requires at least one layer")


@dataclass(frozen=True)
class Histogram(Serializable):
    source: object
    x: Field | str
    name: str | None = None
    y: Field | str | None = None
    bins: int | None = None
    selection: Selection | None = None
    type: Literal["histogram"] = "histogram"

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "type": self.type,
            "source": ref_name(self.source),
            "x": _axis(self.x),
        }
        if self.name is not None:
            out["name"] = self.name
        if self.y is not None:
            out["y"] = _axis(self.y)
        if self.bins is not None:
            out["bins"] = self.bins
        if self.selection is not None:
            out["selection"] = self.selection.to_dict()
        return out


@dataclass(frozen=True)
class Scatterplot(Serializable):
    source: object
    x: Field | str
    y: Field | str
    name: str | None = None
    color: Field | str | None = None
    selection: Selection | None = None
    type: Literal["scatterplot"] = "scatterplot"

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "type": self.type,
            "source": ref_name(self.source),
            "x": _axis(self.x),
            "y": _axis(self.y),
        }
        if self.name is not None:
            out["name"] = self.name
        if self.color is not None:
            out["color"] = _axis(self.color)
        if self.selection is not None:
            out["selection"] = self.selection.to_dict()
        return out


@dataclass(frozen=True)
class Table(Serializable):
    source: object
    columns: list[Field | str]
    name: str | None = None
    selection: Selection | None = None
    sort: dict[str, Any] | None = None
    type: Literal["table"] = "table"

    def __post_init__(self) -> None:
        if not self.columns:
            raise ValueError("Table requires at least one column")

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "type": self.type,
            "source": ref_name(self.source),
            "columns": [_axis(column) for column in self.columns],
        }
        if self.name is not None:
            out["name"] = self.name
        if self.selection is not None:
            out["selection"] = self.selection.to_dict()
        if self.sort is not None:
            out["sort"] = to_plain(self.sort)
        return out


def _axis(axis: Field | str) -> dict[str, Any]:
    if isinstance(axis, Field):
        return axis.to_dict()
    return {"field": axis}


@dataclass(frozen=True)
class Layout(Serializable):
    type: Literal["vertical", "horizontal", "grid"] = "vertical"
    columns: int | None = None
    gap: int | None = None
