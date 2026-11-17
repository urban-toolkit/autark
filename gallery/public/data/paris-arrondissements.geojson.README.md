# Paris arrondissements

`paris-arrondissements.geojson` contains the 20 municipal arrondissements of Paris in
longitude/latitude (OGC CRS84 order: x = longitude, y = latitude).

Source: the "Arrondissements" dataset published by the Direction de l'Urbanisme of the
Ville de Paris on the Paris open data portal, licensed under the Open Database License
(ODbL): https://opendata.paris.fr/explore/dataset/arrondissements/

The file is the portal's GeoJSON export, stored as downloaded. Properties are the
published fields, including `c_ar` (arrondissement number), `l_ar` (display name),
`l_aroff` (official name), `surface` (square metres), and `perimetre` (metres).

## Reproduce

```sh
curl --compressed -o paris-arrondissements.geojson \
  "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/arrondissements/exports/geojson"
```

## Asset verification

- Records: 20.
- Geometry: `Polygon` (one ring per feature).
- Size: 202,223 bytes.
- SHA-256: `b16dbdc2a5f19bbfff1d9644102695694645d8d90ce6c53b582da13e5b178729`.

## Attribution

© Ville de Paris, Direction de l'Urbanisme. Licensed under the
[Open Database License](https://opendatacommons.org/licenses/odbl/1-0/).
