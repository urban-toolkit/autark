# UTKDB

**UTKDB** provides methods to initialize an in-browser database, load spatial data (from OpenStreetMap, CSV files or GeoJson's), extract layers, run custom SQL queries, and export data in GeoJSON format. The documentation below details each method along with enhanced descriptions of their configuration interfaces, presented in table format for clarity.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
  - [Method Summary Table](#method-summary-table)
  - [Detailed Method Documentation](#detailed-method-documentation)
- [TODOs](#todos)
- [Notes & Warnings](#notes--warnings)

## Installation

_Installation instructions can be added here._

## Usage

### Method Summary Table

| Method          | Purpose                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **init**        | Initializes the in-browser database and required packages.                                                                    |
| **loadOsm**     | Loads OpenStreetMap (OSM) data from a PBF file URL into a table. It can extracts and loads specifics layers from the PBF too. |
| **loadCsv**     | Loads a CSV file into a table.                                                                                                |
| **loadLayer**   | Extracts and loads a specific layer from an OSM table.                                                                        |
| **loadQuery**   | Executes a SQL query (with joins, filters, etc.) and creates a new table from the result.                                     |
| **getLayer**    | Exports a layer (of type layer) as a GeoJSON `FeatureCollection`.                                                             |
| **createQuery** | Returns a new `QueryOperation` object to construct a SQL query incrementally.                                                 |
| **applyQuery**  | Executes a given `QueryOperation`, runs the generated SQL, and logs the SQL to the console.                                   |
|                 |

### Detailed Method Documentation

---

### 🔍 `init(): Promise<void>`

- **Purpose:**

  - Initializes the in-browser database and required packages.

- **Usage Example:**

  ```js
  const spatialDb = new SpatialDb();
  await spatialDb.init();
  ```

---

### 🔍 `loadOsm(params: Params): Promise<OsmTable>`

- **Purpose:**

  - Loads OpenStreetMap (OSM) data from a PBF file URL into a table.

- **`Params` (Method Parameters)**

  - **`pbfFileUrl`** _(string, required)_ – The URL of the PBF file containing OpenStreetMap data.
  - **`outputTableName`** _(string, required)_ – The name of the table where the extracted OSM data will be stored.
  - **`boundingBox`** _(optional)_ – A geographic filter to limit data to a specific area:
    - **`minLat` / `maxLat`** – Minimum and maximum latitude values.
    - **`minLon` / `maxLon`** – Minimum and maximum longitude values.
    - ⚠️ **Warning:** [TODO] Review if it's working.
  - **`autoLoadLayers`** _(optional)_ – Configuration for automatically extracting and load specific layers:
    - **`coordinateFormat`** _(string)_ – Defines the format in which coordinates should be stored.
    - **`layers`** _(array)_ – A list of layers to be extracted and stored in separate tables ('surface' | 'coastline' | 'water' | 'parks' | 'roads' | 'buildings').

- **`OsmTable` (Return Type)**

  - **`name`** _(string)_ – The name of the table.
  - **`columns`** _(array)_ – A list of columns describing the structure of the table.
  - **`type`** _(string, fixed to `'osm'`)_ – Specifies that this is an OSM table.

- **Usage Example:**

```js
// Just loading pbf
await spatialDb.loadOsm({
  pbfFileUrl: 'https://example.com/osm.pbf',
  outputTableName: 'my_pbf_table',
});

// Loading pbf and layers
await spatialDb.loadOsm({
  pbfFileUrl: 'https://example.com/osm.pbf',
  outputTableName: 'my_pbf_table',
  autoLoadLayers: {
    coordinateFormat: this.projection,
    layers: ['surface' | 'coastline' | 'parks' | 'water' | 'roads' | 'buildings'],
  },
});

// [TODO] Add bouding box example when check if its working
```

---

### 🔍 `loadCsv(params: Params): Promise<CsvTable>`

- **Purpose:**

  - Loads a CSV file into a table, optionally converting specified columns into spatial points.

- **`Params` (Method Parameters)**

  - **`csvFileUrl`** _(string, required)_ – The URL of the CSV file.
  - **`outputTableName`** _(string, required)_ – The name of the table where the extracted CSV data will be stored.
  - **`delimiter`** _(string, optional)_ – The Delimiter of the CSV file. By default, it will use `,`
  - **`geometryColumns`** _(optional)_ – Specific geometric attributes to understand it as a geometric point (important to make spatial joins after, for example):
    - **`latColumnName`** _(string, required)_ – Latitude column name of point.
    - **`longColumnName`** _(string, required)_ – Longitude column name of point.
    - **`coordinateFormat`** _(string, optional)_ – Coordinate type (it will use `EPSG:4326` by default).

- **`CsvTable` (Return Type)**

  - **`name`** _(string)_ – The name of the table.
  - **`columns`** _(array)_ – A list of columns describing the structure of the table.
  - **`type`** _(string, fixed to `'csv'`)_ – Specifies that this is an CSV table.

- **Usage Example:**

  ```js
  // Load csv
  await spatialDb.loadCsv({
    csvFileUrl: 'https://example.com/data.csv',
    outputTableName: 'csv_table',
  });

  // Load csv, specifying different delimiter and geometric columns
  await spatialDb.loadCsv({
    csvFileUrl: 'https://example.com/data.csv',
    outputTableName: 'csv_table',
    delimiter: ';',
    geometryColumns: {
      latColumnName: 'latitude',
      longColumnName: 'longitude',
      coordinateFormat: 'WGS84',
    },
  });
  ```

---

### 🔍 `loadLayer(params: Params): Promise<LayerTable>`

- **Purpose:**

  - Extracts and loads a specific layer from an existing OSM table.

- **`Params` (Method Parameters)**

  - **`osmInputTableName`** _(string, required)_ – Table name of an OSM Table.
  - **`outputTableName`** _(string, required)_ – The name of the table where the extracted layer data will be stored.
  - **`layer`** _(string, required)_ – Which layer do you want to load (surface' | 'coastline' | 'parks' | 'water' | 'roads' | 'buildings)
  - **`coordinateFormat`** _(string, optional)_ – Coordinate type (it will use `EPSG:4326` by default).

- **`LayerTable` (Return Type)**

  - **`name`** _(string)_ – The name of the table.
  - **`columns`** _(array)_ – A list of columns describing the structure of the table.
  - **`type`** _(string, fixed to `'layer'`)_ – Specifies that this is a Layer table.

- **Usage Example:**

  ```js
  await spatialDb.loadLayer({
    osmInputTableName: 'osm_table',
    outputTableName: 'layer_table',
    layer: 'roads',
    coordinateFormat: 'WGS84',
  });
  ```

---

### 🔍 `loadQuery(query: QueryOperation, outputTableName: string): Promise<Table>`

- **Purpose:**

  - Executes a SQL query—potentially containing joins, filters, and other operations—and creates a new table from the results.

- **`QueryOperation` (What is it?)**

  - It is an object you can create using `spatialDb.createQuery...` (better explained in this class method description [TODO] add a link for it). It contains all information of query you want to load.

- **`LayerTable` (Return Type)**

  - **`name`** _(string)_ – The name of the table.
  - **`columns`** _(array)_ – A list of columns describing the structure of the table.
  - **`type`** _(string, depends on root table)_ – Specifies which table you have in response. If your query is in a LayerTable, for example, the type here will be a Layer. Same occurs if its a csv, or any other.

- **Usage Example:**

  ```js
  const query = spatialDb.createQuery('layer_table').spatialJoin({
    tableRootName: 'layer_table', // if its a layer, loadQuery will create this new table as a Layer too
    tableJoinName: 'other_data_table',
    spatialPredicate: 'NEAR',
    nearDistance: 0.01,
    joinType: 'LEFT',
  });

  await spatialDb.loadQuery(query, 'output_table');
  ```

---

### 🔍 `getLayer(layerTableName: string): Promise<FeatureCollection>`

- **Purpose:**

  - Extract Layer FeatureCollection (GEOJSON) from a LayerTable. If you do not have a LayerTable, you can create it using `loadLayer` method.

- **`FeatureCollection` (Return Type)**

  - It is a type of geojson.

- **Usage Example:**

  ```js
  const geojson = await spatialDb.getLayer('my_layer_table');
  ```

### 🔍 `createQuery(tableName: string): QueryOperation`

- **Purpose:**

  - Create a query operation, that can include select's, join's, spatial join's, filter's, and go on.

- **Which operations do you have?**

  - **filter**: will add `where` in query to filter data based in a logic. Params:

    - **`tableName`** _(string, optional)_ – The name of the table you want to filter. By default, will consider createQuery table name (main table of query). But if you want to filter based on a join, for example, you can pass a different tableName.
    - **`column`** _(string)_ – Column of table you want to filter.
    - **`value`** _(string)_ – Column of table you want to filter.
    - ⚠️ **Warning:** [TODO] This filter just work for string column. Should extend for more types (like date, numbers, ...). And consider not just "equal", but other compare operations.

  - **select**: will add custom `select`, to select just specific attributes in your query

    - **`tableName`** _(string, optional)_ – The name of the table you want to select attributes. By default, will consider createQuery table name (main table of query). But if you want to select based on a join, for example, you can pass a different tableName.
    - **`columns`** _(string[])_ – Array of column names you want to filter.

  - **join**: allows joining another table into your query.

    - **tableRootName** _(string)_ – The name of the main table in the query.
    - **tableJoinName** _(string)_ – The name of the table to join.
    - **columnRoot** _(string)_ – The column from the root table to be used in the join condition.
    - **columnJoin** _(string)_ – The column from the joined table to be used in the join condition.
    - **joinType** _(string, optional)_ – The type of join to perform. Options: `'INNER'`, `'LEFT'`, `'RIGHT'`, `'FULL'`.

  - **spatialJoin**: performs a spatial join between two tables based on spatial relationships.

    - **tableRootName** _(string)_ – The name of the main table in the query.
    - **tableJoinName** _(string)_ – The name of the table to join (should have a Geometric POINT on it, like when you load a csv).
    - **spatialPredicate** _(string, optional)_ – The spatial condition to apply (default is `INTERSECT`). Options:
      - `'INTERSECT'`: Includes records where geometries from both tables intersect.
      - `'NEAR'`: Includes records where geometries are within a certain distance.
    - **joinType** _(string, optional)_ – The type of join to perform. Options: `'INNER'`, `'LEFT'`, `'RIGHT'`, `'FULL'`.
    - **nearDistance** _(number, optional)_ – Required if using `'NEAR'`. Specifies the maximum distance between geometries to be considered a match.

  - **getSql**: will return raw sql string of operation you create.

  - **getMainTable**: will return main table name of your query (table name you passed on `createQuery`).

- **Usage Example:**

  ```js
  /*
    Example 01:
      - Join user table with other user data table.
      - Filter just user with one specific email (will create a where for it)
      - Select just attributes you want too (from user table and other user data table)
  */

  const query = spatialDb
    .createQuery('user_csv_table')
    .join({
      tableRootName: 'user_csv_table',
      tableJoinName: 'other_user_data_table',
    })
    .filter({ tableName: 'user_csv_table', column: 'email', value: 'lucasalexandre@id.uff.br' })
    .select({ tableName: 'user_csv_table', columns: ['id', 'email'] })
    .select({ tableName: 'other_user_data_table', columns: ['other_data'] });

  console.log(query.getSql());

  /*
    Example 02:
      - Spatial join of a layer with a csv, using NEAR operation with distance of 0.01
  */

  const query = spatialDb.createQuery('my_layer').spatialJoin({
    tableRootName: 'my_layer',
    tableJoinName: 'csv_table',
    spatialPredicate: 'NEAR',
    nearDistance: 0.01,
  });

  console.log(query.getSql());
  ```

### 🔍 `applyQuery(query: QueryOperation): Promise<any> [TODO] type this response if possible`

- **Purpose:**

  - After create a query, you can run and get it's results directly from dabatase

## TO-DOs

Here are some planned improvements and features to be implemented in the future:

### Features

- [] Load custom layers from a geojson`.
- [] Drop tables method, for performance.
- [] Multipolygon > mais desafiador, pensar melhor o que precisa fazer para suportar esse tipo de estrutura, tanto nos `inputs` quanto nos `outputs`.

### Bug fixes

- [] Load of roads.
- [] Buldings parece estar pegando "coisas demais", uns pontos meio sem sentidos. Analisar se tem um problema na query.
