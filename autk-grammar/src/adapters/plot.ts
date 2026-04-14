import { PlotAdapter, PlotSpec } from 'urban-grammar';
import { Targets, MapRegistry, GeoJsonCache } from '../types';
import { SpatialDb } from 'autk-db';
import { Scatterplot, Barchart, ParallelCoordinates, TableVis, PlotEvent as AutkPlotEvent } from 'autk-plot';
import { AutkMap, MapEvent, VectorLayer } from 'autk-map';
import { FeatureCollection } from 'geojson';

export function createPlotAdapter(targets?: Targets, registry?: MapRegistry, cache?: GeoJsonCache): PlotAdapter {

    return {
        async resolvePlot(context: unknown, spec: PlotSpec): Promise<void> {
            if(!targets || !targets.plot) return;

            const div = document.getElementById(targets.plot);
            if(!div) throw new Error(`Could not find plot target: ${targets.plot}`);

            const db = context as SpatialDb | undefined;
            if(!db) throw new Error('No data context available for plot.');

            const geojson: FeatureCollection = cache?.get(spec.dataRef) ?? await db.getLayer(spec.dataRef);

            const events = (spec.events ?? []) as unknown as AutkPlotEvent[];
            const config = {
                div,
                data: geojson,
                labels: { axis: spec.axis, title: spec.title ?? '' },
                events,
                ...(spec.width && { width: spec.width }),
                ...(spec.height && { height: spec.height }),
                ...(spec.margins && { margins: spec.margins }),
            };

            let plot: Scatterplot | Barchart | ParallelCoordinates | TableVis;

            switch(spec.mark) {
                case 'scatter':
                    plot = new Scatterplot(config);
                    break;
                case 'bar':
                    plot = new Barchart(config);
                    break;
                case 'parallel-coordinates':
                    plot = new ParallelCoordinates(config);
                    break;
                case 'table':
                    plot = new TableVis(config);
                    break;
                default:
                    throw new Error(`Unsupported plot mark: ${spec.mark}`);
            }

            // Wire map ↔ plot events if a mapRef is specified
            if(spec.mapRef && registry) {
                const map: AutkMap | undefined = registry.get(spec.mapRef);

                if(map) {
                    map.updateRenderInfoProperty(spec.mapRef, 'isPick', true);

                    map.mapEvents.addEventListener(MapEvent.PICK, (selection: number[]) => {
                        plot.setHighlightedIds(selection);
                    });

                    for(const event of events) {
                        plot.plotEvents.addEventListener(event as AutkPlotEvent, (selection: number[]) => {
                            const layer = map.layerManager.searchByLayerId(spec.mapRef!) as VectorLayer | null;
                            if(layer) layer.setHighlightedIds(selection);
                        });
                    }
                }
            }
        }
    }
}
