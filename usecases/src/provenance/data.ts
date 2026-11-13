/**
 * Data of the case study: the Manhattan regions and their noise complaints.
 *
 * `noise_manhattan_clean.csv` (Autark gallery, March 2025) holds one complaint
 * per row with latitude, longitude, and local date. Each complaint is placed in
 * the region that contains it, at the nested path used by
 * `gallery/src/autk-plot/temporal-events-click.ts` (`sjoin.collect.noise`).
 * The gallery builds the same attribute with an autk-db spatial join; here it
 * is a point-in-polygon test, so the case study needs no database. The
 * complaints per day of each region are also kept as a numeric series
 * (`noise_daily`).
 * This module does not access the DOM.
 */

import type { FeatureCollection, GeoJsonProperties, Geometry, Position } from 'geojson';

import { DATA } from './config';

export type Collection = FeatureCollection<Geometry, GeoJsonProperties>;

/**
 * Loads the regions and attaches their noise complaints.
 *
 * @returns The regions, each with its complaints as `sjoin.collect.noise`.
 * @throws If a dataset cannot be fetched or parsed.
 */
export async function loadRegions(): Promise<Collection> {
    const [regions, noise] = await Promise.all([
        fetch(DATA.regions).then(res => res.json() as Promise<Collection>),
        fetch(DATA.noise).then(res => res.text()),
    ]);
    return withNoiseEvents(regions, noise);
}

/** WGS84 semi-major axis and eccentricity, for EPSG:3395 (World Mercator). */
const RADIUS = 6378137;
const ECCENTRICITY = 0.0818191908426;

/** Projects latitude and longitude to EPSG:3395, the CRS of the region files. */
function worldMercator(lat: number, lon: number): [number, number] {
    const phi = (lat * Math.PI) / 180;
    const s = ECCENTRICITY * Math.sin(phi);
    const y = Math.log(Math.tan(Math.PI / 4 + phi / 2) * Math.pow((1 - s) / (1 + s), ECCENTRICITY / 2));
    return [(RADIUS * lon * Math.PI) / 180, RADIUS * y];
}

/** Even-odd ray test of a point against one ring. */
function inRing([x, y]: [number, number], ring: Position[]): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

/** Converts `03/31/2025 11:17:00 PM` to an ISO string whose UTC fields are the local time. */
function isoLocal(date: string): string | null {
    const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2}) (AM|PM)$/.exec(date.trim());
    if (!match) return null;
    const [, month, day, year, hour, minute, second, half] = match;
    const h = (Number(hour) % 12) + (half === 'PM' ? 12 : 0);
    return `${year}-${month}-${day}T${String(h).padStart(2, '0')}:${minute}:${second}Z`;
}

/**
 * Attaches the complaints inside each region as `sjoin.collect.noise`, and
 * their number as `sjoin.count.noise`, as the gallery spatial join does,
 * and their daily series (`withDailyComplaints`).
 *
 * @param collection Regions in EPSG:3395.
 * @param csv Contents of `noise_manhattan_clean.csv`.
 * @returns The same collection, with an event list and a daily series on every feature.
 */
export function withNoiseEvents(collection: Collection, csv: string): Collection {
    const polygons = collection.features.map(feature => {
        const geometry = feature.geometry;
        if (geometry?.type === 'Polygon') return [geometry.coordinates];
        if (geometry?.type === 'MultiPolygon') return geometry.coordinates;
        return [];
    });
    const events: { date: string }[][] = collection.features.map(() => []);

    const [header, ...lines] = csv.trim().split(/\r?\n/);
    const columns = header.split(',');
    const lat = columns.indexOf('latitude');
    const lon = columns.indexOf('longitude');
    const when = columns.indexOf('date');

    for (const line of lines) {
        const cells = line.split(',');
        const date = isoLocal(cells[when] ?? '');
        if (!date) continue;
        const point = worldMercator(Number(cells[lat]), Number(cells[lon]));
        const region = polygons.findIndex(polygon =>
            polygon.some(([outer, ...holes]) => inRing(point, outer) && !holes.some(hole => inRing(point, hole))));
        if (region >= 0) events[region].push({ date });
    }

    collection.features.forEach((feature, index) => {
        feature.properties = {
            ...(feature.properties ?? {}),
            sjoin: { collect: { noise: events[index] }, count: { noise: events[index].length } },
        };
    });
    return withDailyComplaints(collection);
}

/** One day in milliseconds. */
const DAY = 24 * 60 * 60 * 1000;

/**
 * Attaches the complaints of each region per day as `noise_daily`: one point
 * `{ day: 'YYYY-MM-DD', complaints }` for every day from the first complaint
 * to the last, zero on the days a region had none. Every region then has a
 * numeric series over the same days, the input `reduce-series` reduces (Try
 * it Yourself); no chart of the page reads it. Days are the UTC days of the
 * complaint times, as in `binning-events`.
 *
 * @param collection Regions with their complaints as `sjoin.collect.noise`.
 * @returns The same collection, with a daily series on every feature.
 */
export function withDailyComplaints(collection: Collection): Collection {
    const dayOf = (date: string): number => Math.floor(new Date(date).getTime() / DAY);
    const perRegion = collection.features.map(feature => {
        const counts = new Map<number, number>();
        const events = (feature.properties?.sjoin?.collect?.noise ?? []) as { date: string }[];
        for (const { date } of events) {
            const day = dayOf(date);
            if (Number.isFinite(day)) counts.set(day, (counts.get(day) ?? 0) + 1);
        }
        return counts;
    });
    const days = perRegion.flatMap(counts => [...counts.keys()]);
    const first = Math.min(...days);
    const last = Math.max(...days);
    collection.features.forEach((feature, index) => {
        const series = days.length === 0 ? [] : Array.from({ length: last - first + 1 }, (_, offset) => ({
            day: new Date((first + offset) * DAY).toISOString().slice(0, 10),
            complaints: perRegion[index].get(first + offset) ?? 0,
        }));
        feature.properties = { ...(feature.properties ?? {}), noise_daily: series };
    });
    return collection;
}
