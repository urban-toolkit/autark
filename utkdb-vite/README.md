# DuckDB Get Parks

This application queries park data from an OpenStreetMap PBF file using DuckDB.

## Requirements

- Node.js version 21.6

## Setup

1. Place the `new-york-latest.osm.pbf` file inside the `/public` folder.
2. Run the following commands to install dependencies and start the application:
   ```sh
   npm install
   npm run dev
   ```

## Usage

1. Open your browser and navigate to the application.
2. Click the "Run Query" button to execute the `PARKS_QUERY` and it will print the park data from the PBF file on browser console.

## SQL Query

This is the SQL query executed by the application:

```sql
SELECT * FROM ST_READOSM('http://localhost:5173/new-york-latest.osm.pbf') WHERE
  kind IN ('way', 'rel') AND
  (
    map_extract(tags, 'leisure')[1] IN ('dog_park', 'park', 'playground', 'recreation_ground') OR
    map_extract(tags, 'landuse')[1] IN ('wood', 'grass', 'forest', 'orchad', 'village_green', 'vineyard', 'cemetery', 'meadow', 'village_green') OR
    map_extract(tags, 'natural')[1] IN ('wood', 'grass')
  );
```

## Known Issues

### Persistence with DuckDB

Currently, DuckDB has limitations regarding persistence. This means that it is not possible to save and reload the full state of the database efficiently. They are working to implement this functionality (https://duckdb.org/2021/10/29/duckdb-wasm.html).

### Memory Limitations with Large .osm.pbf Files

Loading the full new-york-latest.osm.pbf file can exceed the available memory. But its possible to save a query result inside a table and then execute more fast queries inside it.
