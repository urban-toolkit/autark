# Taxi gallery data

Both TaxiVis-inspired gallery pages run from local assets. The 90,432-row extract contains eligible trips between the demo's selectable pickup and drop-off zones. It is not a citywide sample, and it contains no rider or vehicle identifiers. Filtering is documented on both pages. The airport example uses every eligible trip for the selected destination; the fare example takes up to 400 trips per day-type cohort in deterministic hash order.

Sources: [NYC TLC Trip Record Data](https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page), [January 2024 Yellow Taxi Parquet](https://d37ci6vzurychx.cloudfront.net/trip-data/yellow_tripdata_2024-01.parquet), and [TLC Taxi Zone boundaries](https://d37ci6vzurychx.cloudfront.net/misc/taxi_zones.zip). Boundaries are simplified and reprojected to WGS84; lines connect representative points of zones and do not depict recorded routes.

To regenerate the two assets, download the source files, install `duckdb`, `pyshp`, `shapely`, and `pyproj` in a Python environment, then run:

```sh
python gallery/scripts/prepare-taxi-gallery.py yellow_tripdata_2024-01.parquet taxi_zones.zip
```
