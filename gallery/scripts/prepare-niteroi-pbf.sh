#!/usr/bin/env bash
# Repack the complete local Niterói extract for a standalone gallery build.
set -euo pipefail

repo_root=$(cd "$(dirname "$0")/../.." && pwd)
source_file=${1:-"$repo_root/usecases/public/data/niteroi.osm.pbf"}
output_file=${2:-"$repo_root/gallery/public/data/niteroi.osm.pbf"}
command -v osmium >/dev/null
if [[ -e "$output_file" ]]; then
    printf 'Refusing to overwrite existing output: %s\n' "$output_file" >&2
    exit 1
fi
osmium check-refs -r "$source_file"
osmium cat "$source_file" -o "$output_file"
osmium check-refs -r "$output_file"
osmium fileinfo -e "$output_file"
