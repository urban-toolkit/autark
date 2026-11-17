#!/usr/bin/env bash
# Prepare a self-contained La Condamine / Monaco-Ville extract for all three queries.
set -euo pipefail

repo_root=$(cd "$(dirname "$0")/../.." && pwd)
source_file=${1:?Usage: prepare-monaco-pbf.sh SOURCE_PBF [OUTPUT_PBF]}
output_file=${2:-"$repo_root/gallery/public/data/monaco-condamine.osm.pbf"}
command -v osmium >/dev/null
if [[ -e "$output_file" ]]; then
    printf 'Refusing to overwrite existing output: %s\n' "$output_file" >&2
    exit 1
fi
work=$(mktemp -d "${TMPDIR:-/tmp}/autark-monaco-pbf.XXXXXX")
printf 'Working directory (retained for inspection): %s\n' "$work"

# Use the land municipality as the scope, not the country with its territorial waters.
# Retain both complete district boundaries and all dependencies of that municipal relation.
osmium getid -r "$source_file" r2220322 r2221178 r2220207 -o "$work/boundary.osm.pbf"
osmium check-refs -r "$work/boundary.osm.pbf"

# Keep the five standard themes, cafes, and playgrounds, including complete member ways.
# Coastlines are retained for reconstructing land and harbor water without Overpass.
osmium tags-filter "$source_file" \
    nwr/building nwr/building:part r/type=building w/highway \
    nwr/leisure=dog_park,park,playground,recreation_ground \
    nwr/landuse=wood,grass,forest,orchard,village_green,vineyard,cemetery,meadow \
    nwr/natural=wood,grass,grassland,forest,scrub,heath,meadow,water,wetland,strait,spring,coastline \
    nwr/water=pond,reservoir,lagoon,stream_pool,lake,pool,canal,river nwr/amenity=cafe \
    -o "$work/themes.osm.pbf"
osmium extract -b 7.4158,43.7293,7.4322,43.7378 \
    -s smart -S types=multipolygon,building \
    "$work/themes.osm.pbf" -o "$work/clipped.osm.pbf"
# Named queries classify coastlines over the complete municipal scope, including coasts
# outside the two selected districts; otherwise neighboring land can be mistaken for sea.
osmium tags-filter "$source_file" w/natural=coastline -o "$work/all-coasts.osm.pbf"
osmium extract -b 7.4090,43.7247,7.4399,43.7520 -s complete_ways \
    "$work/all-coasts.osm.pbf" -o "$work/coasts.osm.pbf"
osmium merge "$work/boundary.osm.pbf" "$work/clipped.osm.pbf" "$work/coasts.osm.pbf" -o "$work/final.osm.pbf"
osmium check-refs -r "$work/final.osm.pbf"
osmium fileinfo -e "$work/final.osm.pbf"
# cat refuses to overwrite an existing file, including one created since the initial check.
osmium cat "$work/final.osm.pbf" -o "$output_file"
printf 'Generated: %s\n' "$output_file"
