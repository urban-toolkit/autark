"""Export entrances linked to London Underground stop areas from an Overpass response.

Use the query in gallery/public/data/london.README.md. Coordinates remain at their
mapped locations; no nearest-line snapping or distance-based filtering is applied.
"""

import argparse
import csv
import json

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source", help="Overpass JSON containing stop areas and their entrance nodes")
parser.add_argument("output", help="Output CSV path")
args = parser.parse_args()

with open(args.source, encoding="utf-8") as source:
    response = json.load(source)
if response.get("remark"):
    raise ValueError(response["remark"])

stations = {}
for element in response["elements"]:
    if element["type"] != "relation" or element.get("tags", {}).get("public_transport") != "stop_area":
        continue
    for member in element["members"]:
        if member["type"] == "node":
            stations.setdefault(member["ref"], []).append(element)

rows = []
for element in response["elements"]:
    tags = element.get("tags", {})
    if element["type"] != "node" or tags.get("railway") != "subway_entrance":
        continue
    areas = stations.get(element["id"])
    if not areas:
        raise ValueError(f"Entrance {element['id']} has no associated Tube stop area")
    lon, lat = round(element["lon"], 6), round(element["lat"], 6)
    rows.append({
        "osm_id": element["id"],
        "station": "; ".join(sorted({area["tags"]["name"] for area in areas})),
        "stop_area_ids": ";".join(str(area["id"]) for area in sorted(areas, key=lambda a: a["id"])),
        "name": tags.get("name", ""),
        "entrance": tags.get("entrance", ""),
        "exit": tags.get("ref", ""),
        "wheelchair": tags.get("wheelchair", ""),
        "lon": lon,
        "lat": lat,
    })
rows.sort(key=lambda row: (row["station"], row["osm_id"]))
assert rows and len({row["osm_id"] for row in rows}) == len(rows), "Missing or duplicate entrances"
with open(args.output, "w", newline="", encoding="utf-8") as output:
    writer = csv.DictWriter(output, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
print(f"Exported {len(rows)} station-linked entrances to {args.output}")
