import { AutkDb } from '@urban-toolkit/autk-db';
import { generateSyntheticPolygons } from '../generators/geojson-generator';

export interface IngestionBenchmarkResult {
  operation: string;
  format: string;
  itemCount: number;
  durationMs: number;
  throughputItemsPerSec: number;
}

export class DirectDbBenchmark {
  private db!: AutkDb;

  public async init(): Promise<void> {
    this.db = new AutkDb();
    await this.db.init();
  }

  public async benchmarkGeojsonIngestion(count: number): Promise<IngestionBenchmarkResult> {
    const geojson = generateSyntheticPolygons({ count });
    const start = performance.now();
    await this.db.loadGeojson({
      geojsonObject: geojson,
      outputTableName: `bench_geojson_${count}`,
    });
    const durationMs = performance.now() - start;
    return {
      operation: 'loadGeojson',
      format: 'geojson',
      itemCount: count,
      durationMs: Math.round(durationMs),
      throughputItemsPerSec: Math.round(count / (durationMs / 1000)),
    };
  }

  public async benchmarkCsvMatrixIngestion(rowCount: number): Promise<IngestionBenchmarkResult> {
    const header = ['id', 'latitude', 'longitude', 'value'];
    const rows: unknown[][] = [header];
    for (let i = 0; i < rowCount; i++) {
      rows.push([i + 1, 40.7128 + (i * 0.0001), -74.0060 + (i * 0.0001), Math.random() * 100]);
    }

    const start = performance.now();
    await this.db.loadCsv({
      csvObject: rows,
      outputTableName: `bench_csv_${rowCount}`,
      geometryColumns: true,
    });
    const durationMs = performance.now() - start;
    return {
      operation: 'loadCsv',
      format: 'csv-matrix',
      itemCount: rowCount,
      durationMs: Math.round(durationMs),
      throughputItemsPerSec: Math.round(rowCount / (durationMs / 1000)),
    };
  }
}
