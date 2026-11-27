"""Build the bundled TaxiVis-inspired fixtures from official NYC TLC files.

Usage: python gallery/scripts/prepare-taxi-gallery.py TRIPS.parquet TAXI_ZONES.zip
Requires duckdb, pyshp, shapely and pyproj. Use January 2024 yellow taxi trips.
"""

import csv
from decimal import Decimal
import json
from pathlib import Path
import sys

import duckdb
from pyproj import Transformer
import shapefile
from shapely.geometry import mapping, shape
from shapely.ops import transform, unary_union

ORIGINS = [79, 87, 132, 138, 186, 237]
DESTINATIONS = [161, 162, 163, 164, 186, 230]
OUTPUT = Path(__file__).resolve().parents[1] / "public" / "data"


def main(trips, zones):
    rows = duckdb.connect().execute("""
        WITH trips AS (
            SELECT PULocationID AS pickup, DOLocationID AS dropoff,
                   hour(tpep_pickup_datetime) AS hour,
                   CASE WHEN dayofweek(tpep_pickup_datetime) IN (0, 6) THEN 1 ELSE 0 END AS weekend,
                   date_diff('second', tpep_pickup_datetime, tpep_dropoff_datetime) AS seconds,
                   CAST(round(fare_amount * 100) AS INTEGER) AS cents,
                   tpep_pickup_datetime AS started
            FROM read_parquet(?)
            WHERE tpep_pickup_datetime >= TIMESTAMP '2024-01-01'
              AND tpep_pickup_datetime < TIMESTAMP '2024-02-01'
              AND PULocationID IN (SELECT unnest(?)) AND DOLocationID IN (SELECT unnest(?))
              AND PULocationID <> DOLocationID
              AND fare_amount > 0 AND fare_amount <= 300
        )
        SELECT pickup, dropoff, hour, weekend, seconds, cents FROM trips
        WHERE seconds BETWEEN 60 AND 7200
        ORDER BY md5(concat_ws(':', pickup, dropoff, started, seconds, cents)), pickup, dropoff, hour, weekend, seconds, cents
    """, [trips, ORIGINS, DESTINATIONS]).fetchall()
    with (OUTPUT / "taxi-gallery-trips.csv").open("w", newline="") as out:
        writer = csv.writer(out, lineterminator="\n")
        writer.writerow(("pickup", "dropoff", "hour", "weekend", "seconds", "cents"))
        writer.writerows(rows)

    to_lonlat = Transformer.from_crs(2263, 4326, always_xy=True).transform
    grouped = {}
    records = shapefile.Reader(zones).shapeRecords()
    for record in records:
        props = record.record.as_dict()
        zone = int(props["LocationID"])
        if props["borough"] not in {"Manhattan", "Queens", "Brooklyn", "Bronx"}:
            continue
        grouped.setdefault(zone, (props, []))[1].append(shape(record.shape.__geo_interface__).buffer(0))
    features = []
    for zone, (props, polygons) in sorted(grouped.items()):
        polygon = unary_union(polygons)
        if polygon.is_empty:
            continue
        location = transform(to_lonlat, polygon.representative_point())
        simplified = transform(to_lonlat, polygon.simplify(85 if zone in ORIGINS + DESTINATIONS else 250, preserve_topology=True))
        features.append({"type": "Feature", "geometry": mapping(simplified), "properties": {
            "id": zone, "name": props["zone"], "center": [location.x, location.y],
        }})
    # Keep roughly decimeter precision without shipping the entire shapefile.
    with (OUTPUT / "taxi-gallery-zones.geojson").open("w") as out:
        serialized = json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":"))
        json.dump(json.loads(serialized, parse_float=lambda raw: float(round(Decimal(raw), 6))), out, separators=(",", ":"))
        out.write("\n")
    print(f"{len(rows):,} trips; {len(features)} zones")


if __name__ == "__main__":
    main(*sys.argv[1:])
