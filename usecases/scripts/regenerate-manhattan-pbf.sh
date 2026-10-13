#!/usr/bin/env bash
# Repair and extract the existing local dataset; this is not a fresh OSM snapshot.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
# Historical island-extract workflow; the original source is no longer bundled.
source_file=${1:?Usage: regenerate-manhattan-pbf.sh SOURCE_PBF [OUTPUT_PBF]}
output=${2:-"$root/public/data/mnt-island.osm.pbf"}
for tool in osmium curl python3; do command -v "$tool" >/dev/null; done
if [[ -e "$output" ]]; then
    printf 'Refusing to overwrite existing output: %s\n' "$output" >&2
    exit 1
fi
work=$(mktemp -d "${TMPDIR:-/tmp}/autark-manhattan-pbf.XXXXXX")
printf 'Working directory (retained for inspection): %s\n' "$work"

# Preserve actual OSM tags: the island is place=island, not boundary=administrative.
for relation in 3954665 175905 2389632; do
    curl --fail --location --retry 2 --max-time 120 \
        -A 'Autark-case-study-data-preparation/1.0' \
        "https://www.openstreetmap.org/api/0.6/relation/$relation/full" \
        -o "$work/$relation.osm"
    osmium check-refs -r "$work/$relation.osm"
done

osmium export "$work/3954665.osm" --geometry-types polygon -u type_id -o "$work/export.geojson"
python3 - "$work" <<'PY'
import json
import pathlib
import sys
work = pathlib.Path(sys.argv[1])
features = json.loads((work / 'export.geojson').read_text())['features']
island = [feature for feature in features if feature['id'] == 'a7909331'
          and feature['properties'].get('name') == 'Manhattan Island']
if len(island) != 1:
    raise RuntimeError('Expected exactly one polygon for OSM relation 3954665.')
(work / 'island.geojson').write_text(json.dumps(island[0]))
PY

# Keep the themes used by Urbane and their referenced members, not incomplete
# transport routes or unrelated administrative relations from the original PBF.
osmium tags-filter "$source_file" \
    nwr/building nwr/building:part r/type=building w/highway \
    nwr/leisure=dog_park,park,playground,recreation_ground \
    nwr/landuse=wood,grass,forest,orchard,village_green,vineyard,cemetery,meadow \
    nwr/natural=wood,grass,grassland,forest,scrub,heath,meadow,water,wetland,strait,spring,coastline \
    nwr/water=pond,reservoir,lagoon,stream_pool,lake,pool,canal,river \
    -o "$work/themes.osm.pbf"

# apply-changes selects one version per object when mixing local data and live
# boundary geometry. Plain merge would retain multiple versions of updated IDs.
osmium apply-changes "$work/themes.osm.pbf" "$work/3954665.osm" "$work/175905.osm" \
    -o "$work/completed.osm.pbf"
osmium extract -p "$work/island.geojson" -s smart -S types=multipolygon,building \
    "$work/completed.osm.pbf" -o "$work/extract.osm.pbf"

# Extraction can remove boundary members outside the island. Reattach the full
# island, NYC scope and Upper New York Bay geometry to keep references complete.
osmium apply-changes "$work/extract.osm.pbf" "$work/3954665.osm" "$work/175905.osm" "$work/2389632.osm" \
    -o "$work/final.osm.pbf"
osmium check-refs -r "$work/final.osm.pbf"
osmium fileinfo -e "$work/final.osm.pbf"
# Do not replace an existing file, including the original source.
cp -n "$work/final.osm.pbf" "$output"
printf 'Generated: %s\n' "$output"
