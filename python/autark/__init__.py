"""Python builders for Autark declarative specifications."""

from .data import CSV, OSM, GeoJSON, latlng, wkt
from .display import to_html
from .encodings import Encoding, Field, Scale, Value, field, value
from .links import Link
from .selections import Selection, interval, multi, point
from .spec import AutarkSpec, Metadata, Spec, Workspace
from .transforms import (
    Aggregation,
    Near,
    SpatialJoin,
    avg,
    collect,
    count,
    maximum,
    max,
    minimum,
    min,
    sum,
    total,
    weighted,
)
from .views import Camera, Histogram, Layer, Layout, Map

__all__ = [
    "Aggregation",
    "AutarkSpec",
    "CSV",
    "Camera",
    "Encoding",
    "Field",
    "GeoJSON",
    "Histogram",
    "Layer",
    "Layout",
    "Link",
    "Map",
    "Metadata",
    "Near",
    "OSM",
    "Scale",
    "Selection",
    "Spec",
    "SpatialJoin",
    "Value",
    "Workspace",
    "avg",
    "collect",
    "count",
    "field",
    "interval",
    "latlng",
    "maximum",
    "max",
    "minimum",
    "min",
    "multi",
    "point",
    "sum",
    "to_html",
    "total",
    "value",
    "weighted",
    "wkt",
]
