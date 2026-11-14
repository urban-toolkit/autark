# Niterói OpenStreetMap extract

`niteroi.osm.pbf` is the local OSM input for `terrain-layers-niteroi.html` (local GeoTIFF terrain) and `terrain-layers-niteroi-streamed.html` (streamed elevation tiles). Neither example queries Overpass or OSM geocoding, and neither loads imagery. Streamed elevation and library runtime resources may still use the network.

The file was repacked from the repository's [`usecases/public/data/niteroi.osm.pbf`](../../../usecases/public/data/niteroi.osm.pbf). It contains the complete Rio de Janeiro state boundary (relation 57963), Niterói municipality (relation 2220789), the prepared roads/parks/water themes, and coastlines covering the geocode extent. The state boundary and extended coastlines support region scoping and land/water reconstruction; the runtime query still selects Niterói.

Both examples use `nit_buildings.geojson`. Only the local terrain example reads `niteroi-elevation.tif`; the streamed example uses Mapzen Terrarium elevation tiles instead. The original OSM surface defines the terrain geometry in both examples.

## Reproduce

Requires `osmium-tool`. From the repository root, generate the gallery asset when the output does not already exist:

```sh
bash gallery/scripts/prepare-niteroi-pbf.sh
```

For a new output path or an updated prepared extract:

```sh
bash gallery/scripts/prepare-niteroi-pbf.sh /path/to/prepared-niteroi.osm.pbf /path/to/output.osm.pbf
```

The script checks all way/relation references before and after repacking and refuses to overwrite an existing output. To prepare a fresh extract from a complete regional snapshot, first use [`prepare-usecase-pbf.sh`](../../../usecases/scripts/prepare-usecase-pbf.sh) with its `niteroi` case.

## Asset verification

- Size: 2,000,180 bytes.
- Objects: 215,826 nodes, 13,514 ways, 29 relations.
- Latest object timestamp: October 9, 2026, 20:31:41 UTC. This is not a claim about the snapshot's download date.
- `osmium check-refs -r`: no missing nodes, ways, or relations.
- SHA-256: `e010c3068def0c138bbc7223fc400de0798f07609c03a01c4fccc4071ee91661`.

## Attribution

© [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), licensed under the [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/). Regional preparation context is documented in the [use cases README](../../../usecases/README.md).
