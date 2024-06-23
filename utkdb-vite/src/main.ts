import { loadDb } from "./config/duckdb";

const PARKS_QUERY = `
SELECT * FROM ST_READOSM('http://localhost:5173/new-york-latest.osm.pbf') WHERE
  kind IN ('way', 'rel') AND
  (
    map_extract(tags, 'leisure')[1] IN ('dog_park', 'park', 'playground', 'recreation_ground') OR
    map_extract(tags, 'landuse')[1] IN ('wood', 'grass', 'forest', 'orchad', 'village_green', 'vineyard', 'cemetery', 'meadow', 'village_green') OR
    map_extract(tags, 'natural')[1] IN ('wood', 'grass')
  );
`;

async function main() {
  const db = await loadDb();
  console.log("database loaded");

  const conn = await db.connect();
  console.log("connection opened");

  await conn.query("INSTALL spatial; LOAD spatial;");
  console.log("spatial extesion installed");

  console.log(`Executing park query :${PARKS_QUERY}`);
  const arrowResult = await conn.query(PARKS_QUERY);
  console.log("Park query executed");

  const result = arrowResult.toArray().map((row: any) => row.toJSON());
  console.log({ result });

  await conn.close();
  console.log("connection closed");
}

document.addEventListener("DOMContentLoaded", async () => {
  const runQueryButton = document.getElementById("runQueryButton");

  runQueryButton?.addEventListener("click", () => {
    main().catch(console.error);
  });
});
