import type { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';

import {
    presetEventsByResolution,
    presetHistogram,
    presetTimeseriesAggregate,
    type AutkDatum,
} from 'autk-plot';

type DemoRow = AutkDatum & GeoJsonProperties;

type DemoFeatureCollection = FeatureCollection<Geometry | null, GeoJsonProperties>;

type EventFeatureProperties = GeoJsonProperties & {
    label: string;
    events: Array<{ timestamp: string; weight: number }>;
};

type TimeseriesFeatureProperties = GeoJsonProperties & {
    label: string;
    series: Array<{ timestamp: string; value: number }>;
};

const HISTOGRAM_DATA_URL = '/data/mnt_neighs_proj.geojson';

function toRows(collection: DemoFeatureCollection): DemoRow[] {
    return collection.features.map((feature, index) => ({
        ...(feature.properties ?? {}),
        autkIds: [index],
    }));
}

function createEventCollection(): FeatureCollection<Geometry | null, EventFeatureProperties> {
    return {
        type: 'FeatureCollection',
        features: [
            {
                type: 'Feature',
                geometry: null,
                properties: {
                    label: 'sensor-a',
                    events: [
                        { timestamp: '2025-01-03T10:00:00Z', weight: 3 },
                        { timestamp: '2025-01-19T18:00:00Z', weight: 2 },
                        { timestamp: '2025-02-11T11:30:00Z', weight: 4 },
                    ],
                },
            },
            {
                type: 'Feature',
                geometry: null,
                properties: {
                    label: 'sensor-b',
                    events: [
                        { timestamp: '2025-02-01T08:00:00Z', weight: 5 },
                        { timestamp: '2025-02-24T16:00:00Z', weight: 1 },
                        { timestamp: '2025-03-07T13:15:00Z', weight: 6 },
                    ],
                },
            },
            {
                type: 'Feature',
                geometry: null,
                properties: {
                    label: 'sensor-c',
                    events: [
                        { timestamp: '2025-01-27T09:20:00Z', weight: 7 },
                        { timestamp: '2025-03-02T21:45:00Z', weight: 2 },
                    ],
                },
            },
        ],
    };
}

function createTimeseriesCollection(): FeatureCollection<Geometry | null, TimeseriesFeatureProperties> {
    return {
        type: 'FeatureCollection',
        features: [
            {
                type: 'Feature',
                geometry: null,
                properties: {
                    label: 'station-a',
                    series: [
                        { timestamp: '2021', value: 14 },
                        { timestamp: '2022', value: 17 },
                        { timestamp: '2023', value: 19 },
                        { timestamp: '2024', value: 21 },
                    ],
                },
            },
            {
                type: 'Feature',
                geometry: null,
                properties: {
                    label: 'station-b',
                    series: [
                        { timestamp: '2021', value: 12 },
                        { timestamp: '2022', value: 15 },
                        { timestamp: '2023', value: 18 },
                        { timestamp: '2024', value: 23 },
                    ],
                },
            },
            {
                type: 'Feature',
                geometry: null,
                properties: {
                    label: 'station-c',
                    series: [
                        { timestamp: '2021', value: 16 },
                        { timestamp: '2022', value: 16 },
                        { timestamp: '2023', value: 20 },
                        { timestamp: '2024', value: 22 },
                    ],
                },
            },
        ],
    };
}

function renderMeta(hostId: string, items: string[]): void {
    const host = document.querySelector(`#${hostId}`);
    if (!host) return;

    host.innerHTML = items.map(item => `<span class="meta-chip">${item}</span>`).join('');
}

function renderTable(
    hostId: string,
    columns: string[],
    rows: Array<Array<string | number>>,
    codeSample: string
): void {
    const host = document.querySelector(`#${hostId}`);
    if (!host) return;

    const header = columns.map(column => `<th>${column}</th>`).join('');
    const body = rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('');

    host.innerHTML = `
        <pre class="code">${codeSample}</pre>
        <div class="table-wrap">
            <table class="table">
                <thead><tr>${header}</tr></thead>
                <tbody>${body}</tbody>
            </table>
        </div>
    `;
}

async function renderHistogramDemo(): Promise<void> {
    const collection = await fetch(HISTOGRAM_DATA_URL).then(res => res.json() as Promise<DemoFeatureCollection>);
    const rows = toRows(collection);
    const bins = presetHistogram({
        rows,
        column: 'shape_area',
        numBins: 8,
        divisor: 1_000_000,
        labelSuffix: 'M',
    });

    renderMeta('histogramMeta', [
        `${collection.features.length} source features`,
        `${bins.length} bins`,
        'provenance via autkIds',
    ]);

    renderTable(
        'histogramTable',
        ['label', 'count', 'autkIds'],
        bins.map(bin => [bin.label, bin.count, bin.autkIds.join(', ')]),
        "presetHistogram({ rows, column: 'shape_area', numBins: 8, divisor: 1_000_000, labelSuffix: 'M' })"
    );
}

function renderTemporalEventsDemo(): void {
    const collection = createEventCollection();
    const rows = toRows(collection as DemoFeatureCollection);
    const buckets = presetEventsByResolution({
        rows,
        resolution: 'month',
        reducer: 'sum',
        eventsOf: row => Array.isArray(row.events) ? row.events as EventFeatureProperties['events'] : [],
        timestampOf: event => event.timestamp,
        valueOf: event => event.weight,
    });

    renderMeta('eventsMeta', [
        `${collection.features.length} source features`,
        `${buckets.length} monthly buckets`,
        'reducer: sum',
    ]);

    renderTable(
        'eventsTable',
        ['bucket', 'value', 'count', 'autkIds'],
        buckets.map(bucket => [bucket.bucket, bucket.value, bucket.count, bucket.autkIds.join(', ')]),
        "presetEventsByResolution({ rows, resolution: 'month', reducer: 'sum', eventsOf, timestampOf, valueOf })"
    );
}

function renderTimeseriesDemo(): void {
    const collection = createTimeseriesCollection();
    const rows = toRows(collection as DemoFeatureCollection);
    const series = presetTimeseriesAggregate({
        rows,
        reducer: 'avg',
        pointsOf: row => Array.isArray(row.series) ? row.series as TimeseriesFeatureProperties['series'] : [],
    });

    renderMeta('timeseriesMeta', [
        `${collection.features.length} source features`,
        `${series.length} timestamps`,
        'reducer: avg',
    ]);

    renderTable(
        'timeseriesTable',
        ['timestamp', 'avg', 'count', 'autkIds'],
        series.map(point => [point.bucket, point.value.toFixed(2), point.count, point.autkIds.join(', ')]),
        "presetTimeseriesAggregate({ rows, reducer: 'avg', pointsOf })"
    );
}

async function main(): Promise<void> {
    await renderHistogramDemo();
    renderTemporalEventsDemo();
    renderTimeseriesDemo();
}

main().catch((error) => {
    console.error('Failed to render transform presets demo.', error);
});
