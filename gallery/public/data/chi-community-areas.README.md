# Chicago community areas

`chi-community-areas.geojson` contains the 77 official community areas of Chicago in
longitude/latitude (OGC CRS84 order: x = longitude, y = latitude).

Source: the City of Chicago community-areas boundary layer, as redistributed in
RandomFractals/ChicagoCrimes (`data/chicago-community-areas.geojson`). Coordinates were
rounded to five decimals (about one metre) and each area is stored as a single-ring
MultiPolygon; properties are limited to `community` and `area_numbe`.

City of Chicago data is published for public use under the City’s data-portal terms:
https://www.chicago.gov/city/en/narr/foia/data_disclaimer.html
