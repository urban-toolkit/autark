# Rio de Janeiro road sample

- Source: OpenStreetMap, downloaded November 12, 2026.
- Request: https://api.openstreetmap.org/api/0.6/map?bbox=-43.220,-22.968,-43.195,-22.953
- Area: Jardim Botanico and Humaita, Rio de Janeiro.
- Coordinates: WGS84 longitude/latitude (EPSG:4326).
- Contents: 681 OpenStreetMap ways with a highway tag, represented as LineString features. Original highway classes, names, and way IDs are retained. Building and other unrelated map data are excluded.
- Attribution: © OpenStreetMap contributors.
- License information: https://www.openstreetmap.org/copyright

The terrain categorical example loads the GeoJSON through `autk-db`, which projects it into the default EPSG:3395 workspace. Major roads (motorway/trunk/primary and their links), secondary roads, and remaining road/path classes map to numerical categories 3, 1, and 2. The original flat categorical example keeps its original classification. The map displays OpenStreetMap attribution independently of the selected imagery provider.
