import { AutkSpatialDb } from 'autk-db';
import { FeatureCollection, Feature } from 'geojson';

/**
 * Example that tests the updateTable method with OSM layer data.
 *
 * Flow:
 * 1. Load OSM data with loadOsmFromOverpassApi (buildings layer)
 * 2. Get the layer with getLayer('buildings') → returns GeoJSON
 * 3. Transform the data (add a new property to each feature)
 * 4. Update the table with updateTable (replace strategy)
 * 5. Get the layer again and verify the transformation persisted
 */
export class UpdateTableExample {
    protected db!: AutkSpatialDb;
    private outputDiv: HTMLElement | null = null;

    public async run(): Promise<void> {
        this.outputDiv = document.getElementById('output');
        
        try {
            await this.step1_initAndLoadOsm();
            await this.step2_getOriginalLayer();
            await this.step3_transformAndUpdate();
            await this.step4_verifyUpdate();
            
            this.log('All steps completed successfully!', 'success');
        } catch (error) {
            this.log(`Error: ${error instanceof Error ? error.message : String(error)}`, 'error');
            console.error(error);
        }
    }

    private async step1_initAndLoadOsm(): Promise<void> {
        this.logStep(1, 'Initialize DB and load OSM data');
        
        this.db = new AutkSpatialDb();
        await this.db.init();

        this.log('Loading OSM data from Overpass API (this may take a moment)...');
        
        await this.db.loadOsm({
            queryArea: {
                geocodeArea: 'New York',
                areas: ['Battery Park City'],
            },
            outputTableName: 'table_osm',
            autoLoadLayers: {
                coordinateFormat: 'EPSG:3395',
                layers: ['buildings'],
                dropOsmTable: true,
            },
        });

        this.log(`Loaded tables: ${this.db.tables.map(t => t.name).join(', ')}`);
        
        const buildingsTable = this.db.tables.find(t => t.name === 'table_osm_buildings');
        if (buildingsTable) {
            this.log(`Buildings table columns: ${buildingsTable.columns.map(c => c.name).join(', ')}`);
        }
    }

    private async step2_getOriginalLayer(): Promise<FeatureCollection> {
        this.logStep(2, 'Get original buildings layer as GeoJSON');
        
        const geojson = await this.db.getLayer('table_osm_buildings');
        
        this.log(`Original GeoJSON has ${geojson.features.length} features`);
        
        // Show first feature as sample
        if (geojson.features.length > 0) {
            const sampleFeature = geojson.features[0];
            this.log('Sample feature properties (before transform):');
            this.logJson(sampleFeature.properties);
        }
        
        return geojson;
    }

    private async step3_transformAndUpdate(): Promise<void> {
        this.logStep(3, 'Transform data and update table');
        
        // Get the current layer data
        const geojson = await this.db.getLayer('table_osm_buildings');
        
        // Transform: add a new property to each feature
        const transformedGeoJson: FeatureCollection = {
            type: 'FeatureCollection',
            features: geojson.features.map((feature: Feature, index: number) => ({
                ...feature,
                properties: {
                    ...feature.properties,
                    custom_index: index,
                    updated_at: new Date().toISOString(),
                    is_processed: true,
                },
            })),
        };
        
        this.log(`Transformed ${transformedGeoJson.features.length} features (added custom_index, updated_at, is_processed)`);
        
        // Update the table using replace strategy
        this.log('Calling updateTable with replace strategy...');
        
        const updatedTable = await this.db.updateTable({
            tableName: 'table_osm_buildings',
            data: transformedGeoJson,
            strategy: 'replace',
        });
        
        this.log(`Table updated! New columns: ${updatedTable.columns.map(c => c.name).join(', ')}`);
    }

    private async step4_verifyUpdate(): Promise<void> {
        this.logStep(4, 'Verify update by getting layer again');
        
        const geojson = await this.db.getLayer('table_osm_buildings');
        
        this.log(`Updated GeoJSON has ${geojson.features.length} features`);
        
        // Verify the transformation persisted
        if (geojson.features.length > 0) {
            const sampleFeature = geojson.features[0];
            this.log('Sample feature properties (after update):');
            this.logJson(sampleFeature.properties);
            
            // Check if our custom properties exist
            const props = sampleFeature.properties as Record<string, unknown>;
            const hasCustomIndex = 'custom_index' in props;
            const hasUpdatedAt = 'updated_at' in props;
            const hasIsProcessed = 'is_processed' in props;
            
            if (hasCustomIndex && hasUpdatedAt && hasIsProcessed) {
                this.log('Verification PASSED: All custom properties are present!', 'success');
            } else {
                this.log('Verification FAILED: Some custom properties are missing', 'error');
            }
        }
    }

    private logStep(stepNumber: number, title: string): void {
        if (!this.outputDiv) return;
        
        const stepDiv = document.createElement('div');
        stepDiv.className = 'step';
        stepDiv.id = `step-${stepNumber}`;
        stepDiv.innerHTML = `<h3>Step ${stepNumber}: ${title}</h3>`;
        this.outputDiv.appendChild(stepDiv);
    }

    private log(message: string, type?: 'success' | 'error'): void {
        console.log(message);
        
        if (!this.outputDiv) return;
        
        const lastStep = this.outputDiv.querySelector('.step:last-child');
        const targetElement = lastStep || this.outputDiv;
        
        const p = document.createElement('p');
        p.textContent = message;
        if (type) {
            p.className = type;
        }
        targetElement.appendChild(p);
    }

    private logJson(obj: unknown): void {
        console.log(obj);
        
        if (!this.outputDiv) return;
        
        const lastStep = this.outputDiv.querySelector('.step:last-child');
        const targetElement = lastStep || this.outputDiv;
        
        const pre = document.createElement('pre');
        pre.textContent = JSON.stringify(obj, null, 2);
        targetElement.appendChild(pre);
    }
}

async function main() {
    const example = new UpdateTableExample();
    await example.run();
}

main();
