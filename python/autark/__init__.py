"""Python builders for Autark declarative specifications."""

from .data import CSV, OSM, GeoJSON, GeoTIFF, JSON, latlng, wkt
from .display import to_embedded_html, to_html
from .encodings import Encoding, Field, Scale, Value, field, value
from .widget import create_widget
from .links import Link
from .selections import Selection, interval, multi, point
from .spec import AutarkSpec, Metadata, Spec, Workspace
from .transforms import (
    Aggregation,
    Compute,
    Heatmap,
    HeatmapGrid,
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
from .views import Camera, Histogram, Layer, Layout, Map, Scatterplot, Table

__all__ = [
    "Aggregation",
    "AutarkSpec",
    "CSV",
    "Camera",
    "Compute",
    "Encoding",
    "Field",
    "GeoJSON",
    "GeoTIFF",
    "Heatmap",
    "HeatmapGrid",
    "Histogram",
    "JSON",
    "Layer",
    "Layout",
    "Link",
    "Map",
    "Metadata",
    "Near",
    "OSM",
    "Scale",
    "Scatterplot",
    "Selection",
    "Spec",
    "SpatialJoin",
    "Table",
    "Value",
    "Workspace",
    "avg",
    "collect",
    "count",
    "create_widget",
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
    "to_embedded_html",
    "to_html",
    "total",
    "value",
    "weighted",
    "wkt",
]
