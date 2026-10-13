#!/usr/bin/env bash
# Prepare a self-contained borough PBF from one complete regional snapshot.
# Coastlines cover the geocode (New York City) envelope, not just the borough.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
source_file=${1:?Provide a complete regional PBF covering Manhattan and its surroundings.}
output=${2:-"$root/public/data/mnt-administrative-geocode-coastlines.osm.pbf"}
for tool in osmium python3; do command -v "$tool" >/dev/null; done
if [[ -e "$output" ]]; then
    printf 'Refusing to overwrite existing output: %s\n' "$output" >&2
    exit 1
fi
work=$(mktemp -d "${TMPDIR:-/tmp}/autark-manhattan-admin.XXXXXX")
printf 'Working directory (retained for inspection): %s\n' "$work"

# Use administrative members from the same snapshot as the coastlines/themes.
osmium getid -r "$source_file" r8398124 r175905 -o "$work/boundaries.osm.pbf"
osmium check-refs -r "$work/boundaries.osm.pbf"
osmium export "$work/boundaries.osm.pbf" --geometry-types polygon --stop-on-error \
    -u type_id -o "$work/boundaries.geojson"
python3 - "$work" <<'PY'
import json
import pathlib
import sys
work = pathlib.Path(sys.argv[1])
features = json.loads((work / 'boundaries.geojson').read_text())['features']
for osm_id, name in [(8398124, 'Manhattan'), (175905, 'New York')]:
    matches = [feature for feature in features if feature['id'] == f'a{osm_id * 2 + 1}'
               and feature['properties'].get('name') == name
               and feature['properties'].get('boundary') == 'administrative']
    if len(matches) != 1:
        raise RuntimeError(f'Expected complete administrative relation {osm_id} ({name}).')
borough = next(feature for feature in features if feature['id'] == 'a16796249')
(work / 'borough.geojson').write_text(json.dumps(borough))
geocode = next(feature for feature in features if feature['id'] == 'a351811')
geometry = geocode['geometry']
polygons = geometry['coordinates'] if geometry['type'] == 'MultiPolygon' else [geometry['coordinates']]
points = [point for polygon in polygons for ring in polygon for point in ring]
# Retain full ways from a modest buffer; reconstruction itself uses the exact bbox.
margin = 0.01
box = [min(p[0] for p in points) - margin, min(p[1] for p in points) - margin,
       max(p[0] for p in points) + margin, max(p[1] for p in points) + margin]
(work / 'coast-bbox.txt').write_text(','.join(map(str, box)))
PY

# Retain thematic objects and their referenced geometry, then restrict their
# candidates to the borough. Runtime clipping still applies the exact boundary.
osmium tags-filter "$source_file" \
    nwr/building nwr/building:part r/type=building w/highway \
    nwr/leisure=dog_park,park,playground,recreation_ground \
    nwr/landuse=wood,grass,forest,orchard,village_green,vineyard,cemetery,meadow \
    nwr/natural=wood,grass,grassland,forest,scrub,heath,meadow,water,wetland,strait,spring \
    nwr/water=pond,reservoir,lagoon,stream_pool,lake,pool,canal,river \
    -o "$work/themes.osm.pbf"
osmium extract -p "$work/borough.geojson" -s smart -S types=multipolygon,building \
    "$work/themes.osm.pbf" -o "$work/borough-themes.osm.pbf"

# Independently retain all coasts in the geocode envelope, including neighboring land
# and islands outside administrative scope, with complete way nodes.
osmium tags-filter "$source_file" w/natural=coastline -o "$work/all-coasts.osm.pbf"
coast_bbox=$(python3 -c 'import pathlib,sys; print(pathlib.Path(sys.argv[1]).read_text())' "$work/coast-bbox.txt")
osmium extract -b "$coast_bbox" -s complete_ways "$work/all-coasts.osm.pbf" -o "$work/coasts.osm.pbf"
osmium merge "$work/borough-themes.osm.pbf" "$work/boundaries.osm.pbf" "$work/coasts.osm.pbf" \
    -o "$work/final.osm.pbf"
osmium check-refs -r "$work/final.osm.pbf"
# Reference completeness does not guarantee closed polygon rings.
osmium tags-filter "$work/final.osm.pbf" r/natural=water,strait r/water=river -o "$work/water.osm.pbf"
osmium export "$work/water.osm.pbf" --geometry-types polygon --stop-on-error -o "$work/water-validation.geojson"
osmium fileinfo -e "$work/final.osm.pbf"
cp -n "$work/final.osm.pbf" "$output"
printf 'Generated: %s\n' "$output"
