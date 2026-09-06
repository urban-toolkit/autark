import { AutkDb } from '@urban-toolkit/autk-db';
import {
  generateSpatialBenchTrips,
  generateSpatialBenchBuildings,
  generateSpatialBenchZones,
} from '../generators/spatialbench-schema';

export interface SpatialBenchQueryResult {
  queryId: string;
  name: string;
  operation: string;
  scaleFactor: number;
  rowCount: number;
  durationMs: number;
  resultCount: number;
}

export class SpatialBenchSuiteRunner {
  private db!: AutkDb;

  public async init(): Promise<void> {
    this.db = new AutkDb();
    await this.db.init();
  }

  private getTableSuffix(scaleFactor: number): string {
    return String(scaleFactor).replace(/[^a-zA-Z0-9]/g, '_');
  }

  public async loadScaleFactorData(scaleFactor: number): Promise<{ tripCount: number; buildingCount: number; zoneCount: number; loadDurationMs: number }> {
    const sfx = this.getTableSuffix(scaleFactor);
    const tripCount = Math.max(100, Math.round(5000 * scaleFactor));
    const buildingCount = Math.max(50, Math.round(500 * Math.max(1, 1 + Math.log2(scaleFactor > 0 ? scaleFactor : 1))));
    const zoneCount = Math.max(10, Math.round(25 * Math.max(1, scaleFactor)));

    const start = performance.now();

    const trips = generateSpatialBenchTrips(tripCount);
    const buildings = generateSpatialBenchBuildings(buildingCount);
    const zones = generateSpatialBenchZones(zoneCount);

    const tripCsvRows: unknown[][] = [
      ['t_tripkey', 't_custkey', 't_driverkey', 'latitude', 'longitude', 't_fare', 't_distance', 't_pickuptime'],
      ...trips.map(t => [t.t_tripkey, t.t_custkey, t.t_driverkey, t.pickup_latitude, t.pickup_longitude, t.t_fare, t.t_distance, t.t_pickuptime]),
    ];

    await this.db.loadCsv({
      csvObject: tripCsvRows,
      outputTableName: `trip_sf_${sfx}`,
      geometryColumns: true,
    });

    await this.db.loadGeojson({
      geojsonObject: buildings,
      outputTableName: `building_sf_${sfx}`,
    });

    await this.db.loadGeojson({
      geojsonObject: zones,
      outputTableName: `zone_sf_${sfx}`,
    });

    const loadDurationMs = Math.round(performance.now() - start);
    return { tripCount, buildingCount, zoneCount, loadDurationMs };
  }

  public async runQ1DistanceJoin(scaleFactor: number): Promise<SpatialBenchQueryResult> {
    const sfx = this.getTableSuffix(scaleFactor);
    const tripTable = `trip_sf_${sfx}`;
    const buildingTable = `building_sf_${sfx}`;
    const ws = this.db.getCurrentWorkspace();
    const start = performance.now();

    const result = await this.db.rawQuery<{ toArray: () => unknown[] }>({
      query: `
        SELECT
          b.id AS building_id,
          b.properties->>'b_name' AS building_name,
          COUNT(*) AS nearby_pickup_count
        FROM ${ws}.${tripTable} t
        JOIN ${ws}.${buildingTable} b
        ON ST_DWithin(t.geometry, b.geometry, 500)
        GROUP BY b.id, b.properties->>'b_name'
        ORDER BY nearby_pickup_count DESC
        LIMIT 100;
      `,
      output: { type: 'RETURN_OBJECT' },
    });

    const durationMs = Math.max(1, Math.round(performance.now() - start));
    const rows = result && typeof (result as any).toArray === 'function' ? (result as any).toArray() : [];

    return {
      queryId: 'Q1',
      name: 'Distance Join (ST_DWithin 500m)',
      operation: 'Distance Join & Group By',
      scaleFactor,
      rowCount: rows.length,
      durationMs,
      resultCount: rows.length,
    };
  }

  public async runQ2PointInPolygonJoin(scaleFactor: number): Promise<SpatialBenchQueryResult> {
    const sfx = this.getTableSuffix(scaleFactor);
    const tripTable = `trip_sf_${sfx}`;
    const zoneTable = `zone_sf_${sfx}`;
    const ws = this.db.getCurrentWorkspace();
    const start = performance.now();

    const result = await this.db.rawQuery<{ toArray: () => unknown[] }>({
      query: `
        SELECT
          z.id AS zone_id,
          z.properties->>'z_name' AS zone_name,
          COUNT(*) AS trip_count,
          AVG(t.t_fare) AS avg_fare
        FROM ${ws}.${tripTable} t
        JOIN ${ws}.${zoneTable} z
        ON ST_Intersects(t.geometry, z.geometry)
        GROUP BY z.id, z.properties->>'z_name'
        ORDER BY trip_count DESC;
      `,
      output: { type: 'RETURN_OBJECT' },
    });

    const durationMs = Math.max(1, Math.round(performance.now() - start));
    const rows = result && typeof (result as any).toArray === 'function' ? (result as any).toArray() : [];

    return {
      queryId: 'Q2',
      name: 'Point-in-Polygon (ST_Intersects)',
      operation: 'Spatial Intersection & Aggregate',
      scaleFactor,
      rowCount: rows.length,
      durationMs,
      resultCount: rows.length,
    };
  }

  public async runQ3ConvexHullAggregation(scaleFactor: number): Promise<SpatialBenchQueryResult> {
    const sfx = this.getTableSuffix(scaleFactor);
    const tripTable = `trip_sf_${sfx}`;
    const zoneTable = `zone_sf_${sfx}`;
    const ws = this.db.getCurrentWorkspace();
    const start = performance.now();

    const result = await this.db.rawQuery<{ toArray: () => unknown[] }>({
      query: `
        SELECT
          z.id AS zone_id,
          z.properties->>'z_name' AS zone_name,
          COUNT(*) as point_count,
          ST_Area(ST_ConvexHull(ST_Collect(ARRAY_AGG(t.geometry)))) AS zone_hull_area
        FROM ${ws}.${tripTable} t
        JOIN ${ws}.${zoneTable} z
        ON ST_Intersects(t.geometry, z.geometry)
        GROUP BY z.id, z.properties->>'z_name'
        HAVING point_count > 5
        ORDER BY zone_hull_area DESC;
      `,
      output: { type: 'RETURN_OBJECT' },
    });

    const durationMs = Math.max(1, Math.round(performance.now() - start));
    const rows = result && typeof (result as any).toArray === 'function' ? (result as any).toArray() : [];

    return {
      queryId: 'Q3',
      name: 'Convex Hull & Area (ST_ConvexHull)',
      operation: 'Geometric Aggregation',
      scaleFactor,
      rowCount: rows.length,
      durationMs,
      resultCount: rows.length,
    };
  }
}
