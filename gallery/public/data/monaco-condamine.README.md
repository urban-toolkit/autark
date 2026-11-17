# La Condamine and Monaco-Ville OSM extract

`monaco-condamine.osm.pbf` supplies D06, **Access OpenStreetMap from a local extract**, with the same three query modes as D05: named districts, a bounding box, and custom tag filters. All OSM acquisition stays local; no Overpass or geocoding fallback is used.

## Source and license

- Source: [Geofabrik Monaco, November 16, 2026](https://download.geofabrik.de/europe/monaco-261116.osm.pbf).
- Source snapshot: `2026-11-16T21:22:36Z`; downloaded November 17, 2026.
- Source SHA-256: `59b29e20d8c4bf3fee61277f814bb76e917faf42b91809a854c437ecb99de05e`.
- Data: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Distributed by [Geofabrik](https://download.geofabrik.de/europe/monaco.html).
- Prepared file: 173,135 bytes; 11,011 nodes, 2,180 ways, 21 relations.
- Prepared SHA-256: `bb44bfa9602c36dc9abf9374c4f8852672101d60581d9f28277e7323945c2420`.

## Selection and preparation

The named query uses `{ geocodeArea: 'Monaco', areas: ['La Condamine', 'Monaco-Ville'] }`, including the old town immediately south of Port Hercule. The file contains the complete municipal boundary (relation **2220322**, not the country's territorial-water boundary), its dependencies, and both district boundaries (**2221178** and **2220207**).

The bounding-box and tag variants use `[7.4158, 43.7293, 7.4322, 43.7378]` (west, south, east, north), enclosing both districts. The named query follows their actual boundaries rather than the enclosing rectangle.

The extract retains roads, buildings and building parts, standard park/water categories, and cafe nodes. Complete ways and multipolygons are retained, including untagged members. Coastlines over the whole municipal scope support the named query's land/harbor mask. Consequently the stored geometry extends beyond the demonstration bbox; the loader performs the final spatial selection. Other OSM features absent from this prepared file cannot be recovered by changing a tag filter.

Reproduce with `osmium-tool` (prepared with 1.19.1):

```sh
curl -fL https://download.geofabrik.de/europe/monaco-261116.osm.pbf -o /tmp/monaco-source.osm.pbf
bash gallery/scripts/prepare-monaco-pbf.sh /tmp/monaco-source.osm.pbf /tmp/monaco-condamine.osm.pbf
osmium check-refs -r /tmp/monaco-condamine.osm.pbf
shasum -a 256 /tmp/monaco-condamine.osm.pbf
```

The script refuses to overwrite existing output and retains its temporary files for inspection. No coordinates are snapped or repaired. `osmium check-refs -r` reports zero missing node, way, or relation references.

## Verified imports

Counts below are exported GeoJSON features after workspace clipping, not pre-clipping acquisition timings:

| Layer | Bounding box | Named districts | Custom tags |
|---|---:|---:|---:|
| Surface | 1 | 2 | 1 |
| Parks | 31 | 23 | 31 |
| Water | 3 | 3 | 3 |
| Roads | 480 | 324 | 480 |
| Buildings | 296 | 154 | — |
| Cafes (points) | — | — | 15 |

The custom-tag variant adds **15 cafe points** and omits buildings, using the same filters as D05. All three modes were imported from the bundled file with external OSM requests rejected.

The source contains one invalid building geometry (relation **11384697**); the importer warns and omits it in all three modes. It is preserved unchanged in the PBF rather than silently repaired.
