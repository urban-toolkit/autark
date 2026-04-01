import { AutkSpatialDb } from 'autk-db';
import { FeatureCollection, Feature } from 'geojson';

/**
 * Example that tests the updateTable method with 'update' strategy.
 *
 * Flow:
 * 1. Load OSM data with loadOsmFromOverpassApi (buildings layer)
 * 2. Get the layer with getLayer → returns GeoJSON
 * 3. Modify only a SUBSET of features (first 5 buildings)
 * 4. Update using 'update' strategy with idColumn = 'properties.building_id'
 * 5. Verify that:
 *    - Modified features have the new properties
 *    - Unmodified features are preserved (kept unchanged)
 */
export class UpdateTableUpsertExample {
    protected db!: AutkSpatialDb;
    private outputDiv: HTMLElement | null = null;
    private originalFeatureCount: number = 0;
    private modifiedIds: string[] = [];

    public async run(): Promise<void> {
        this.outputDiv = document.getElementById('output');
        
        try {
            await this.step1_initAndLoadOsm();
            await this.step2_getOriginalAndIdentifySubset();
            await this.step3_updateSubset();
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

    private async step2_getOriginalAndIdentifySubset(): Promise<void> {
        this.logStep(2, 'Get original layer and identify subset to modify');
        
        const geojson = await this.db.getLayer('table_osm_buildings');
        this.originalFeatureCount = geojson.features.length;
        
        this.log(`Buildings layer has ${this.originalFeatureCount} features`);
        
        // Show sample feature to see available properties
        if (geojson.features.length > 0) {
            this.log('Sample feature properties (before update):');
            this.logJson(geojson.features[0].properties);
        }
        
        // Identify the building_ids we'll modify (first 5)
        const subsetCount = Math.min(5, geojson.features.length);
        this.modifiedIds = geojson.features
            .slice(0, subsetCount)
            .map(f => (f.properties as Record<string, unknown>).building_id as string);
        
        this.log(`Will modify ${subsetCount} features with building_ids: ${this.modifiedIds.join(', ')}`);
    }

    private async step3_updateSubset(): Promise<void> {
        this.logStep(3, 'Update only the subset of features');
        
        const geojson = await this.db.getLayer('table_osm_buildings');
        
        // Take only the features we identified
        const subset = geojson.features.filter(f => 
            this.modifiedIds.includes((f.properties as Record<string, unknown>).building_id as string)
        );
        
        // Transform the subset: add custom properties
        const modifiedSubset: FeatureCollection = {
            type: 'FeatureCollection',
            features: subset.map((feature: Feature) => ({
                ...feature,
                properties: {
                    ...feature.properties,
                    is_modified: true,
                    modified_at: new Date().toISOString(),
                    special_tag: 'UPDATED',
                },
            })),
        };
        
        this.log(`Sending ${modifiedSubset.features.length} modified features to update`);
        this.log('Modified features will have: is_modified=true, modified_at, special_tag="UPDATED"');
        
        // Update using building_id as the identifier
        this.log('Calling updateTable with update strategy and idColumn="properties.building_id"...');
        
        const updatedTable = await this.db.updateTable({
            tableName: 'table_osm_buildings',
            data: modifiedSubset,
            strategy: 'update',
            idColumn: 'properties.building_id',
        });
        
        this.log(`Update complete! Table columns: ${updatedTable.columns.map(c => c.name).join(', ')}`);
    }

    private async step4_verifyUpdate(): Promise<void> {
        this.logStep(4, 'Verify update results');
        
        const geojson = await this.db.getLayer('table_osm_buildings');
        
        this.log(`Total features after update: ${geojson.features.length}`);
        
        // Check 1: Total count should be the same (update keeps existing records)
        if (geojson.features.length === this.originalFeatureCount) {
            this.log(`✓ Feature count preserved: ${geojson.features.length} (expected: ${this.originalFeatureCount})`, 'success');
        } else {
            this.log(`✗ Feature count mismatch: ${geojson.features.length} (expected: ${this.originalFeatureCount})`, 'error');
        }
        
        // Check 2: Modified features should have the new properties
        let modifiedCount = 0;
        let unmodifiedCount = 0;
        
        for (const feature of geojson.features) {
            const props = feature.properties as Record<string, unknown>;
            const buildingId = props.building_id as string;
            
            if (this.modifiedIds.includes(buildingId)) {
                // This feature should have been modified
                if (props.is_modified === true && props.special_tag === 'UPDATED') {
                    modifiedCount++;
                }
            } else {
                // This feature should NOT have is_modified
                if (props.is_modified === undefined || props.is_modified === null) {
                    unmodifiedCount++;
                }
            }
        }
        
        this.log(`Modified features with new properties: ${modifiedCount}/${this.modifiedIds.length}`);
        this.log(`Unmodified features preserved: ${unmodifiedCount}/${this.originalFeatureCount - this.modifiedIds.length}`);
        
        // Show a modified feature
        const modifiedFeature = geojson.features.find(f => 
            this.modifiedIds.includes((f.properties as Record<string, unknown>).building_id as string)
        );
        if (modifiedFeature) {
            this.log('Sample MODIFIED feature:');
            this.logJson(modifiedFeature.properties);
        }
        
        // Show an unmodified feature
        const unmodifiedFeature = geojson.features.find(f => 
            !this.modifiedIds.includes((f.properties as Record<string, unknown>).building_id as string)
        );
        if (unmodifiedFeature) {
            this.log('Sample UNMODIFIED feature (should NOT have is_modified):');
            this.logJson(unmodifiedFeature.properties);
        }
        
        // Final verification
        const allModifiedCorrect = modifiedCount === this.modifiedIds.length;
        const allUnmodifiedCorrect = unmodifiedCount === (this.originalFeatureCount - this.modifiedIds.length);
        
        if (allModifiedCorrect && allUnmodifiedCorrect) {
            this.log('Verification PASSED: Update worked correctly!', 'success');
        } else {
            this.log('Verification FAILED: Some features were not updated correctly', 'error');
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
    const example = new UpdateTableUpsertExample();
    await example.run();
}

main();
