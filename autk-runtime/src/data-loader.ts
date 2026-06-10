/**
 * DataLoader - Loads data sources into AutkDb
 */

import { AutkDb } from '@urban-toolkit/autk-db';
import type { DataSource, Workspace } from './types.js';

export class DataLoader {
  /**
   * Initialize database with workspace configuration.
   */
  async initializeDatabase(workspace?: Workspace): Promise<AutkDb> {
    const db = new AutkDb();
    await db.init();

    // Set workspace name if provided
    if (workspace?.name) {
      await db.setWorkspace(workspace.name);
    }

    // TODO: Set coordinate format if needed

    return db;
  }

  /**
   * Load a single data source into the database.
   */
  async loadDataSource(db: AutkDb, source: DataSource): Promise<void> {
    switch (source.type) {
      case 'osm':
        await this.loadOsmSource(db, source);
        break;
      case 'geojson':
        await this.loadGeoJsonSource(db, source);
        break;
      case 'csv':
        await this.loadCsvSource(db, source);
        break;
      default:
        throw new Error(`Unknown data source type: ${(source as DataSource).type}`);
    }
  }

  /**
   * Load OSM data source.
   *
   * IMPORTANT: Must pass outputTableName to match spec convention.
   */
  private async loadOsmSource(db: AutkDb, source: Extract<DataSource, { type: 'osm' }>): Promise<void> {
    // Spec has area as a simple string (place name for Overpass query)
    // We use it as both geocodeArea and the single area in the areas array
    const geocodeArea = source.area;
    const areas = [source.area];

    // CRITICAL: Pass outputTableName to ensure tables are named ${name}_${layer}
    await db.loadOsm({
      outputTableName: source.name,  // e.g., "manhattan_osm"
      queryArea: {
        geocodeArea,
        areas,
      },
      autoLoadLayers: {
        layers: source.layers,
        coordinateFormat: source.coordinateFormat,
      },
      pbfFileUrl: source.pbfFileUrl,
      forceRefresh: false,
    });

    // Result: tables created as manhattan_osm_buildings, manhattan_osm_roads, etc.
  }

  /**
   * Load GeoJSON data source.
   */
  private async loadGeoJsonSource(db: AutkDb, source: Extract<DataSource, { type: 'geojson' }>): Promise<void> {
    if (source.url) {
      await db.loadGeojson({
        geojsonFileUrl: source.url,
        outputTableName: source.name,
        layerType: source.layerType,
        coordinateFormat: source.coordinateFormat,
      });
    } else if (source.values) {
      // Support inline GeoJSON values
      // Type assertion: spec defines values as 'object', loadGeojson expects FeatureCollection
      await db.loadGeojson({
        geojsonObject: source.values as any, // TODO: Tighten spec type to FeatureCollection
        outputTableName: source.name,
        layerType: source.layerType,
        coordinateFormat: source.coordinateFormat,
      });
    } else {
      throw new Error('GeoJSON source must have either url or values');
    }
  }

  /**
   * Load CSV data source.
   */
  private async loadCsvSource(db: AutkDb, source: Extract<DataSource, { type: 'csv' }>): Promise<void> {
    if (!source.url) {
      throw new Error('CSV source must have url (inline values not yet supported)');
    }

    const csvOptions: Parameters<typeof db.loadCsv>[0] = {
      csvFileUrl: source.url,
      outputTableName: source.name,
      delimiter: source.delimiter,
    };

    // Add geometry configuration if present
    if (source.geometry) {
      if (source.geometry.type === 'latlng') {
        csvOptions.geometryColumns = {
          latColumnName: source.geometry.latitude,
          longColumnName: source.geometry.longitude,
          coordinateFormat: source.geometry.coordinateFormat,
        };
      } else if (source.geometry.type === 'wkt') {
        csvOptions.geometryColumns = {
          wktColumnName: source.geometry.column,
          coordinateFormat: source.geometry.coordinateFormat,
        };
      }
    }

    await db.loadCsv(csvOptions);
  }
}
