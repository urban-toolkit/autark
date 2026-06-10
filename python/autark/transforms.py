from __future__ import annotations

from dataclasses import dataclass, field as dataclass_field
from typing import Literal

from ._serialise import Serializable, ref_name

AggregationOp = Literal["count", "sum", "avg", "min", "max", "weighted", "collect"]


@dataclass(frozen=True)
class Near(Serializable):
    distance: float
    use_centroid: bool | None = dataclass_field(default=None, metadata={"json": "useCentroid"})

    def __post_init__(self) -> None:
        if self.distance <= 0:
            raise ValueError("Near distance must be greater than zero")


@dataclass(frozen=True)
class Aggregation(Serializable):
    column: str
    op: AggregationOp
    as_: str | None = dataclass_field(default=None, metadata={"json": "as"})
    normalize: bool | None = None


def count(column: str = "*", as_: str | None = None, normalize: bool | None = None) -> Aggregation:
    return Aggregation(column=column, op="count", as_=as_, normalize=normalize)


def total(column: str, as_: str | None = None, normalize: bool | None = None) -> Aggregation:
    return Aggregation(column=column, op="sum", as_=as_, normalize=normalize)


def sum(column: str, as_: str | None = None, normalize: bool | None = None) -> Aggregation:
    return total(column=column, as_=as_, normalize=normalize)


def avg(column: str, as_: str | None = None, normalize: bool | None = None) -> Aggregation:
    return Aggregation(column=column, op="avg", as_=as_, normalize=normalize)


def minimum(column: str, as_: str | None = None, normalize: bool | None = None) -> Aggregation:
    return Aggregation(column=column, op="min", as_=as_, normalize=normalize)


def min(column: str, as_: str | None = None, normalize: bool | None = None) -> Aggregation:
    return minimum(column=column, as_=as_, normalize=normalize)


def maximum(column: str, as_: str | None = None, normalize: bool | None = None) -> Aggregation:
    return Aggregation(column=column, op="max", as_=as_, normalize=normalize)


def max(column: str, as_: str | None = None, normalize: bool | None = None) -> Aggregation:
    return maximum(column=column, as_=as_, normalize=normalize)


def weighted(column: str, as_: str | None = None, normalize: bool | None = None) -> Aggregation:
    return Aggregation(column=column, op="weighted", as_=as_, normalize=normalize)


def collect(column: str, as_: str | None = None, normalize: bool | None = None) -> Aggregation:
    return Aggregation(column=column, op="collect", as_=as_, normalize=normalize)


@dataclass(frozen=True)
class SpatialJoin(Serializable):
    root: object
    join: object
    near: Near | None = None
    group_by: list[Aggregation] | None = dataclass_field(default=None, metadata={"json": "groupBy"})
    type: Literal["spatialJoin"] = "spatialJoin"

    def to_dict(self) -> dict[str, object]:
        out: dict[str, object] = {
            "type": self.type,
            "root": ref_name(self.root),
            "join": ref_name(self.join),
        }
        if self.near is not None:
            out["near"] = self.near.to_dict()
        if self.group_by:
            out["groupBy"] = [item.to_dict() for item in self.group_by]
        return out
