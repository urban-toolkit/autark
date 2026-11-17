# London files in three formats

These assets feed `src/autk-map/csv-wkt-vis.html`, which loads the same city from a CSV with
a WKT column, a JSON array with WKT, and a CSV with longitude/latitude columns: borough
polygons, Tube lines, and Tube entrances.

All three files are imported into one workspace. The boroughs cover the whole area, so they
are imported first: the first vector table sets the workspace extent that later imports are
clipped to, which keeps every layer on the same ground.

## `london-boroughs.csv`

- Source: Office for National Statistics, "Local Authority Districts (December 2024)
  Boundaries UK BGC" (generalised boundaries), filtered to the 33 Greater London
  districts (`LAD24CD LIKE 'E09%'`) through the ONS Open Geography Portal feature service.
- Columns: `code` (source `LAD24CD`), `name` (source `LAD24NM`), `wkt` (`POLYGON` or
  `MULTIPOLYGON` in WGS84 longitude/latitude, rounded to six decimals).
- License: Open Government Licence v3.0 (© Crown copyright and database right).

```sh
curl -o london-boroughs.geojson \
  "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Local_Authority_Districts_December_2024_Boundaries_UK_BGC/FeatureServer/0/query?where=LAD24CD%20LIKE%20%27E09%25%27&outFields=LAD24CD,LAD24NM&outSR=4326&f=geojson"
```

## `london-tube-lines.json`

- Source: OpenStreetMap route relations tagged `route=subway` inside Greater London,
  retrieved with the Overpass API. All relations of one line are merged into a single
  `MULTILINESTRING`, and member ways shared by several relations are stored once.
- 11 lines. Columns: `name` (line name, used for the categorical color), `colour` (official
  line colour), `network`, `operator`, `wkt`. Coordinates are rounded to six decimals.
- License: © OpenStreetMap contributors, ODbL (https://www.openstreetmap.org/copyright).

```overpassql
[out:json][timeout:240];
area["name"="Greater London"]["boundary"="administrative"]->.a;
relation(area.a)["route"="subway"]["type"="route"];
out geom;
```

## `london-tube-entrances.csv`

- Source: OpenStreetMap entrances belonging to `public_transport=stop_area` relations
  that contain stops of `network=London Underground`, `route=subway` services in Greater London.
  The previous citywide `railway=subway_entrance` query also included DLR, other rail
  services, and unrelated pedestrian subways, producing points far from the Tube lines.
- 528 station-linked entrance nodes before workspace clipping to the boroughs. Columns:
  `osm_id`, `station`, `stop_area_ids`, `name` (empty for unnamed entrances), `entrance`,
  `exit` (source `ref`), `wheelchair`, `lon`, `lat`. IDs preserve the station association
  for auditing. Locations are not snapped to tracks; street entrances can legitimately
  be offset from underground platforms.
- The example colors entrances by `wheelchair`: `no` (red), `limited` (blue), `yes`
  (green), and `unmapped` (purple). Empty values are labeled `unmapped` in the displayed
  collection, not treated as inaccessible. The bundled source values are unchanged.
- License: © OpenStreetMap contributors, ODbL.

```overpassql
[out:json][timeout:180];
area["name"="Greater London"]["boundary"="administrative"]->.london;
relation(area.london)["type"="route"]["route"="subway"]["network"="London Underground"]->.routes;
node(r.routes)->.stops;
relation(bn.stops)["public_transport"="stop_area"]->.stations;
.stations out body;
node(r.stations)["railway"="subway_entrance"];
out body;
```

Save the response as `london-entrances.json`, then prepare the bundled CSV:

```sh
python3 gallery/scripts/prepare-london-entrances.py london-entrances.json gallery/public/data/london-tube-entrances.csv
```

## Asset verification

| File | Size | SHA-256 |
|---|---:|---|
| `london-boroughs.csv` | 130,904 | `26c746a93b1681b2e3f6a49b2632129c58c464b709d6104156126eb399b0572e` |
| `london-tube-lines.json` | 462,994 | `810616930327b512104161a0bbdef9bb38baa6845b4171489c2349ae3b35f93a` |
| `london-tube-entrances.csv` | 44,412 | `2f04317a4810707ae12e25147da414ff78f67ba3c4b0be3695d3f855f6dc1193` |
