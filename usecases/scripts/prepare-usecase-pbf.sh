#!/usr/bin/env bash
# Build self-contained example data from a complete regional OSM snapshot.
# Runtime reads this PBF only: complete geocode/areas, themes, and geocode-bbox coastlines.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
case_name=${1:?Usage: prepare-usecase-pbf.sh niteroi|shadows SOURCE_PBF [OUTPUT_PBF] [SUPPLEMENT_OSM]}
source_file=${2:?Provide a complete regional PBF covering the geocode bbox.}
for tool in osmium python3; do command -v "$tool" >/dev/null; done
theme_tags=(w/highway)
case "$case_name" in
    niteroi)
        geocode_id=57963 # Rio de Janeiro state, not the neighboring municipality.
        area_ids=(2220789) # Niterói municipality; omit unrelated homonymous districts.
        default_output="$root/public/data/niteroi.osm.pbf"
        ;;
    shadows)
        geocode_id=122604 # Chicago
        area_ids=(9833255 9877655) # Loop, Near South Side
        theme_tags+=(nwr/building nwr/building:part r/type=building)
        default_output="$root/public/data/shadows-chicago.osm.pbf"
        ;;
    *) printf 'Unknown example: %s\n' "$case_name" >&2; exit 1 ;;
esac
output=${3:-"$default_output"}
if [[ -e "$output" ]]; then
    printf 'Refusing to overwrite existing output: %s\n' "$output" >&2
    exit 1
fi
work=$(mktemp -d "${TMPDIR:-/tmp}/autark-$case_name-pbf.XXXXXX")
printf 'Working directory (retained for inspection): %s\n' "$work"
if [[ "$case_name" == shadows ]]; then
    # Aggregate site relations (e.g. the entire Great Lakes system) are not
    # supported area geometries. Retain the individual lake multipolygons.
    osmium tags-filter -i -R "$source_file" r/type=site -o "$work/without-sites.osm.pbf"
    source_file="$work/without-sites.osm.pbf"
    if [[ -n "${4:-}" ]]; then
        # A metropolitan extract can omit Lake Michigan's distant shores.
        # Accept complete geometry during preparation; runtime stays PBF-only.
        osmium check-refs -r "$4"
        osmium apply-changes "$source_file" "$4" -o "$work/completed.osm.pbf"
        source_file="$work/completed.osm.pbf"
    fi
fi
ids=("r$geocode_id")
for id in "${area_ids[@]}"; do ids+=("r$id"); done
osmium getid -r "$source_file" "${ids[@]}" -o "$work/boundaries.osm.pbf"
osmium check-refs -r "$work/boundaries.osm.pbf"
osmium export "$work/boundaries.osm.pbf" --geometry-types polygon --stop-on-error \
    -u type_id -o "$work/boundaries.geojson"
python3 - "$work" "$geocode_id" "${area_ids[@]}" <<'PY'
import json
import pathlib
import sys
work = pathlib.Path(sys.argv[1])
geo_id, *area_ids = map(int, sys.argv[2:])
features = json.loads((work / 'boundaries.geojson').read_text())['features']
selected = {}
for osm_id in [geo_id, *area_ids]:
    matches = [f for f in features if f['id'] == f'a{osm_id * 2 + 1}'
               and f['properties'].get('boundary') == 'administrative']
    if len(matches) != 1:
        raise RuntimeError(f'Expected complete administrative relation {osm_id}.')
    selected[osm_id] = matches[0]
# Osmium's extraction polygon accepts one MultiPolygon containing all requested areas.
polygons = []
for osm_id in area_ids:
    geom = selected[osm_id]['geometry']
    polygons.extend(geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']])
(work / 'areas.geojson').write_text(json.dumps({'type': 'Feature', 'properties': {},
    'geometry': {'type': 'MultiPolygon', 'coordinates': polygons}}))
geo = selected[geo_id]['geometry']
polygons = geo['coordinates'] if geo['type'] == 'MultiPolygon' else [geo['coordinates']]
points = [p for polygon in polygons for ring in polygon for p in ring]
margin = 0.01
box = [min(p[0] for p in points) - margin, min(p[1] for p in points) - margin,
       max(p[0] for p in points) + margin, max(p[1] for p in points) + margin]
(work / 'coast-bbox.txt').write_text(','.join(map(str, box)))
PY

osmium tags-filter "$source_file" "${theme_tags[@]}" \
    nwr/leisure=dog_park,park,playground,recreation_ground \
    nwr/landuse=wood,grass,forest,orchard,village_green,vineyard,cemetery,meadow \
    nwr/natural=wood,grass,grassland,forest,scrub,heath,meadow,water,wetland,strait,spring \
    nwr/water=pond,reservoir,lagoon,stream_pool,lake,pool,canal,river \
    -o "$work/themes.osm.pbf"
osmium extract -p "$work/areas.geojson" -s smart -S types=multipolygon,building \
    "$work/themes.osm.pbf" -o "$work/area-themes.osm.pbf"
osmium tags-filter "$source_file" w/natural=coastline -o "$work/all-coasts.osm.pbf"
coast_bbox=$(python3 -c 'import pathlib,sys; print(pathlib.Path(sys.argv[1]).read_text())' "$work/coast-bbox.txt")
osmium extract -b "$coast_bbox" -s complete_ways "$work/all-coasts.osm.pbf" -o "$work/coasts.osm.pbf"
osmium merge "$work/area-themes.osm.pbf" "$work/boundaries.osm.pbf" "$work/coasts.osm.pbf" -o "$work/final.osm.pbf"
osmium check-refs -r "$work/final.osm.pbf"
osmium tags-filter "$work/final.osm.pbf" r/natural=water,strait r/water=river -o "$work/water.osm.pbf"
osmium export "$work/water.osm.pbf" --geometry-types polygon --stop-on-error -o "$work/water-validation.geojson"
osmium fileinfo -e "$work/final.osm.pbf"
cp -n "$work/final.osm.pbf" "$output"
printf 'Generated: %s\n' "$output"
