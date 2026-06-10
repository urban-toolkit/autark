from __future__ import annotations

from dataclasses import dataclass, field as dataclass_field
from typing import Any, Literal, Mapping, Sequence

from ._serialise import Serializable, ref_name, to_plain

AggregationOp = Literal["count", "sum", "avg", "min", "max", "weighted", "collect"]
HeatmapAggregationOp = Literal["count", "sum", "avg", "min", "max", "weighted"]
LayerType = Literal["polygons", "polylines", "points", "buildings"]
RenderLayerType = Literal["buildings", "roads", "polygons", "polylines", "points"]


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


@dataclass(frozen=True)
class HeatmapGrid(Serializable):
    rows: int
    columns: int

    def __post_init__(self) -> None:
        if self.rows < 1 or self.columns < 1:
            raise ValueError("Heatmap grid rows and columns must be greater than zero")


@dataclass(frozen=True)
class Heatmap(Serializable):
    source: object
    output: str
    near: Near
    grid: HeatmapGrid | Mapping[str, int]
    group_by: list[Aggregation] | None = dataclass_field(default=None, metadata={"json": "groupBy"})
    type: Literal["heatmap"] = "heatmap"

    def __post_init__(self) -> None:
        if self.group_by:
            unsupported = [item.op for item in self.group_by if item.op == "collect"]
            if unsupported:
                raise ValueError("Heatmap group_by does not support collect aggregation")

    def to_dict(self) -> dict[str, object]:
        grid = to_plain(self.grid)
        if not isinstance(grid, dict):
            raise TypeError("Heatmap grid must serialize to an object")
        out: dict[str, object] = {
            "type": self.type,
            "source": ref_name(self.source),
            "output": self.output,
            "near": self.near.to_dict(),
            "grid": grid,
        }
        if self.group_by:
            out["groupBy"] = [item.to_dict() for item in self.group_by]
        return out


@dataclass(frozen=True)
class Compute(Serializable):
    spec: Mapping[str, Any]

    @staticmethod
    def gpgpu(
        source: object,
        *,
        output: str,
        variable_mapping: Mapping[str, str],
        wgsl_body: str,
        result_field: str | None = None,
        output_columns: Sequence[str] | None = None,
        layer_type: LayerType | None = None,
        coordinate_format: str | None = None,
        attribute_arrays: Mapping[str, int] | None = None,
        attribute_matrices: Mapping[str, Mapping[str, int | str]] | None = None,
        uniforms: Mapping[str, float] | None = None,
        uniform_arrays: Mapping[str, Sequence[float]] | None = None,
        uniform_matrices: Mapping[str, Mapping[str, Any]] | None = None,
    ) -> "Compute":
        if not variable_mapping:
            raise ValueError("Compute.gpgpu requires at least one variable mapping")
        if not wgsl_body.strip():
            raise ValueError("Compute.gpgpu requires a WGSL body")
        if (result_field is None) == (output_columns is None):
            raise ValueError("Compute.gpgpu requires exactly one of result_field or output_columns")

        spec: dict[str, Any] = {
            "type": "gpgpuCompute",
            "source": ref_name(source),
            "output": output,
            "variableMapping": dict(variable_mapping),
            "wgslBody": wgsl_body,
        }
        optional = {
            "layerType": layer_type,
            "coordinateFormat": coordinate_format,
            "attributeArrays": dict(attribute_arrays) if attribute_arrays is not None else None,
            "attributeMatrices": dict(attribute_matrices) if attribute_matrices is not None else None,
            "uniforms": dict(uniforms) if uniforms is not None else None,
            "uniformArrays": {key: list(value) for key, value in uniform_arrays.items()} if uniform_arrays is not None else None,
            "uniformMatrices": dict(uniform_matrices) if uniform_matrices is not None else None,
            "resultField": result_field,
            "outputColumns": list(output_columns) if output_columns is not None else None,
        }
        spec.update({key: value for key, value in optional.items() if value is not None})
        return Compute(spec)

    @staticmethod
    def render(
        *,
        output: str,
        layers: Sequence[Mapping[str, Any]],
        viewpoints: Mapping[str, Any],
        aggregation: Mapping[str, Any],
        layer_type: LayerType | None = None,
        coordinate_format: str | None = None,
        camera: Mapping[str, Any] | None = None,
        tile_size: int | None = None,
    ) -> "Compute":
        if not layers:
            raise ValueError("Compute.render requires at least one layer")
        if tile_size is not None and (tile_size < 8 or tile_size % 8 != 0):
            raise ValueError("Compute.render tile_size must be a multiple of 8")

        spec: dict[str, Any] = {
            "type": "renderCompute",
            "output": output,
            "layers": [dict(layer) for layer in layers],
            "viewpoints": dict(viewpoints),
            "aggregation": dict(aggregation),
        }
        optional = {
            "layerType": layer_type,
            "coordinateFormat": coordinate_format,
            "camera": dict(camera) if camera is not None else None,
            "tileSize": tile_size,
        }
        spec.update({key: value for key, value in optional.items() if value is not None})
        return Compute(spec)

    def to_dict(self) -> dict[str, Any]:
        plain = to_plain(self.spec)
        assert isinstance(plain, dict)
        return plain
