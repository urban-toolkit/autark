import { PlotAdapter, PlotSpec, PlotMark } from 'urban-grammar';
import { Targets, MapRegistry, GeoJsonCache } from '../types';
import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkPlot, PlotEvent as AutkPlotEvent } from '@urban-toolkit/autk-plot';
import type { PlotEventData, PlotType, PlotTransformConfig } from '@urban-toolkit/autk-plot';
import { AutkMap, MapEvent } from '@urban-toolkit/autk-map';
import type { MapEventData } from '@urban-toolkit/autk-map';
import { FeatureCollection } from 'geojson';

function grammarMarkToPlotType(mark: PlotMark): PlotType {
    const mapping: Record<PlotMark, PlotType> = {
        'scatter': 'scatterplot',
        'bar': 'barchart',
        'line': 'linechart',
        'linechart': 'linechart',
        'parallel-coordinates': 'parallel-coordinates',
        'table': 'table',
        'heatmatrix': 'heatmatrix',
    };
    return mapping[mark];
}

export function createPlotAdapter(targets?: Targets, registry?: MapRegistry, cache?: GeoJsonCache): PlotAdapter {

    return {
        async resolvePlot(context: unknown, spec: PlotSpec): Promise<void> {
            if(!targets || !targets.plot) return;

            const div = document.getElementById(targets.plot);
            if(!div) throw new Error(`Could not find plot target: ${targets.plot}`);

            const db = context as AutkDb | undefined;
            if(!db) throw new Error('No data context available for plot.');

            const geojson: FeatureCollection = cache?.get(spec.dataRef) ?? await db.getLayer(spec.dataRef);

            const events = (spec.events ?? []) as unknown as AutkPlotEvent[];

            const plot = new AutkPlot(div, {
                type: grammarMarkToPlotType(spec.mark),
                collection: geojson,
                attributes: { axis: spec.axis, ...(spec.color && { color: spec.color }) },
                labels: { axis: spec.axis, title: spec.title },
                events,
                ...(spec.width     && { width: spec.width }),
                ...(spec.height    && { height: spec.height }),
                ...(spec.margins   && { margins: spec.margins }),
                ...(spec.transform && { transform: spec.transform as PlotTransformConfig }),
            });

            // Wire map ↔ plot events if a mapRef is specified
            if(spec.mapRef && registry) {
                const map: AutkMap | undefined = registry.get(spec.mapRef);

                if(map) {
                    map.updateRenderInfo(spec.mapRef, { isPick: true });

                    map.events.on(MapEvent.PICKING, ({ selection }: MapEventData) => {
                        plot.setSelection(selection);
                    });

                    for(const event of events) {
                        plot.events.on(event, ({ selection }: PlotEventData) => {
                            map.setHighlightedIds(spec.mapRef!, selection);
                        });
                    }
                }
            }
        }
    }
}
