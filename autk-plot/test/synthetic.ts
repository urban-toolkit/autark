/**
 * Deterministic synthetic attributes used by the tests.
 *
 * The gallery builds event and series attributes at runtime (autk-db spatial
 * joins, generated series). These helpers attach the same row shapes to a
 * collection without any external dependency.
 */

import type { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';

export type Collection = FeatureCollection<Geometry, GeoJsonProperties>;

/**
 * Attaches the synthetic yearly series used by `gallery/src/autk-plot/timeseries-click.ts`.
 */
export function withSyntheticSeries(collection: Collection): Collection {
    const years = ['2021', '2022', '2023', '2024'];

    collection.features.forEach((feature, index) => {
        const base = 10 + (index % 7);
        feature.properties = {
            ...(feature.properties ?? {}),
            series: years.map((year, yearIndex) => ({
                timestamp: year,
                value: base + yearIndex * (1 + (index % 3)),
            })),
        };
    });

    return collection;
}

/**
 * Attaches deterministic event arrays at the nested path used by
 * `gallery/src/autk-plot/temporal-events-click.ts` (`sjoin.collect.noise`).
 *
 * Feature `i` gets `1 + i % 4` events in 2024, five months apart.
 */
export function withSyntheticEvents(collection: Collection): Collection {
    collection.features.forEach((feature, index) => {
        const noise = Array.from({ length: 1 + (index % 4) }, (_, eventIndex) => {
            const month = 1 + ((index + eventIndex * 5) % 12);
            const day = 1 + ((index * 3 + eventIndex) % 28);
            return {
                date: `2024-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String((index + eventIndex) % 24).padStart(2, '0')}:00:00Z`,
                value: index + eventIndex,
            };
        });

        feature.properties = {
            ...(feature.properties ?? {}),
            sjoin: { collect: { noise } },
        };
    });

    return collection;
}
