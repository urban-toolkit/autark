# Chicago community areas

`chi-community-areas.geojson` contains the 77 official community areas of Chicago in
longitude/latitude (OGC CRS84 order: x = longitude, y = latitude).

Source: the City of Chicago community-areas boundary layer, as redistributed in
RandomFractals/ChicagoCrimes (`data/chicago-community-areas.geojson`). Coordinates were
rounded to five decimals (about one metre) and each area is stored as a single-ring
MultiPolygon; properties are limited to `community` and `area_numbe`.

One area (Norwood Park) arrived as a self-overlapping MultiPolygon, which the map renders
but AutkDb rejects when importing into a workspace (`ST_IsValid`). That geometry was
repaired once with DuckDB `ST_MakeValid`, which unions the overlapping parts, so it is now
a Polygon with the same outer boundary.

Asset verification:

- Records: 77.
- Size: 1,102,145 bytes.
- SHA-256: `b86e6bed8e283083b2697901299ee077668c2001d471fac7a86709156682c122`.

City of Chicago data is published for public use under the City’s data-portal terms:
https://www.chicago.gov/city/en/narr/foia/data_disclaimer.html
