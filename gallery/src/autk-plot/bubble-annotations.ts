import { ColorMapDomainStrategy } from '@urban-toolkit/autk-core';
import type { ColorMapOptions } from '@urban-toolkit/autk-core';
import { AutkPlot, PlotEvent } from '@urban-toolkit/autk-plot';
import { onExampleDispose, runExample } from '../example';
import { airports, chartCollection, destinations, hourBuckets, hours, loadTaxiData, taxiMap, zoneOptions } from './reference-data';
import type { TaxiTrip } from './reference-data';

const groups = ['JFK', 'LaGuardia'];
const colorMap: ColorMapOptions = { type: 'categorical', colors: ['#126a82', '#ad501f'],
    domainSpec: { type: ColorMapDomainStrategy.USER, params: groups } };
const binWidth = 15;
const bins = Array.from({ length: 8 }, (_, i) => `${i * binWidth}–${(i + 1) * binWidth}`);

function profile(trips: TaxiTrip[][]) {
    return chartCollection(trips.flatMap((cohort, airport) => hours.flatMap((hour, index) => {
        const values = cohort.filter(trip => trip.hour === index).map(trip => trip.minutes).sort((a, b) => a - b);
        if (!values.length) return [];
        const value = (values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2;
        return [{ airport: groups[airport], hour, count: values.length, value, series: [{ timestamp: hourBuckets[index], value }] }];
    })));
}

function distribution(trips: TaxiTrip[][], selectedHours: Set<number> | null) {
    return chartCollection(trips.flatMap((cohort, airport) => {
        const selected = selectedHours ? cohort.filter(trip => selectedHours.has(trip.hour)) : cohort;
        const counts = new Array<number>(bins.length).fill(0);
        for (const trip of selected) counts[Math.min(bins.length - 1, Math.floor(trip.minutes / binWidth))]++;
        return selected.length === 0 ? [] : bins.map((bin, i) => ({ bin, airport: groups[airport], share: counts[i] / selected.length }));
    }));
}

async function main(): Promise<() => void> {
    const { routes, zones, zoneData } = await loadTaxiData();
    let destination = 161;
    const routeTrips = () => airports.map(airport => routes.get(`${airport}:${destination}`) ?? []);
    let trips = routeTrips();
    let points = profile(trips);
    const destinationControl = document.querySelector<HTMLSelectElement>('#taxi-destination')!;
    const summary = document.querySelector<HTMLElement>('#taxi-route-status')!;
    const pointStatus = document.querySelector<HTMLElement>('#taxi-point-status')!;
    const distributionStatus = document.querySelector<HTMLElement>('#taxi-hours-status')!;
    const timeline = new AutkPlot(document.querySelector<HTMLElement>('#taxi-timeline')!, {
        type: 'linechart', collection: points, width: 'auto', height: 325,
        attributes: { axis: ['series'], series: 'airport' }, transform: { preset: 'reduce-series' },
        scales: { x: { domain: hourBuckets } }, ticks: { x: { label: key => +key.slice(11, 13) % 4 === 0 ? key.slice(11, 16) : '' } },
        labels: { title: '', axis: ['Pickup hour (NYC local time)', 'Median minutes'] },
        margins: { top: 34, right: 18, bottom: 56, left: 58 }, style: { colorMap },
        events: [PlotEvent.HOVER, PlotEvent.BRUSH_X, PlotEvent.CLICK],
    });
    timeline.setAnnotations([{ id: 'morning', type: 'band', x: [hourBuckets[7], hourBuckets[9]], label: 'Morning rush', color: '#126a82' }]);
    const histogram = new AutkPlot(document.querySelector<HTMLElement>('#taxi-distribution')!, {
        type: 'barchart', collection: distribution(trips, null), width: 'auto', height: 325,
        attributes: { axis: ['bin', 'share'], series: 'airport' }, scales: { x: { domain: bins }, y: { domain: [0, 1] } },
        ticks: { x: { label: key => key }, y: { format: '.0%' } },
        labels: { axis: ['Trip duration (minutes)', 'Share of trips'] },
        margins: { top: 34, right: 16, bottom: 53, left: 58 }, style: { colorMap },
    });
    const showHours = (selection: number[] | null) => {
        const selected = selection ? new Set(selection) : null;
        const counts = trips.map(cohort => selected ? cohort.filter(trip => selected.has(trip.hour)).length : cohort.length);
        histogram.updateCollection(distribution(trips, selected));
        const label = selected ? [...selected].sort((a, b) => a - b).map(hour => hours[hour]).join(', ') || 'No pickup hours' : 'All pickup hours';
        distributionStatus.textContent = `${label} · ${counts[0].toLocaleString('en-US')} JFK · ${counts[1].toLocaleString('en-US')} LaGuardia`;
    };
    const updateLabels = () => {
        const total = trips.reduce((count, cohort) => count + cohort.length, 0);
        summary.textContent = `${total.toLocaleString('en-US')} trips to ${zones.get(destination)!.name}`;
        pointStatus.textContent = 'Hover a point for its trip count. Click an hour or brush across the timeline.';
    };
    const map = await taxiMap(zoneData, [...airports, ...destinations], id => {
        if (destinations.includes(id) && id !== destination) {
            destinationControl.value = String(id);
            destinationControl.dispatchEvent(new Event('change'));
        }
    });
    const onDestination = () => {
        destination = Number(destinationControl.value);
        trips = routeTrips();
        points = profile(trips);
        timeline.updateCollection(points);
        showHours(null);
        updateLabels();
        map?.show(airports, destination, { labels: groups, colorMap });
    };
    zoneOptions(destinationControl, destinations, zones, destination);
    destinationControl.addEventListener('change', onDestination);
    timeline.events.on(PlotEvent.BRUSH_X, ({ extent }) => {
        const x = extent?.data?.x;
        showHours(x?.kind === 'categorical' ? x.keys.map(key => hourBuckets.indexOf(key)).filter(hour => hour >= 0) : null);
    });
    timeline.events.on(PlotEvent.CLICK, ({ selection }) => showHours(selection.length
        ? selection.map(id => hours.indexOf(points.features[id].properties.hour)) : null));
    timeline.events.on(PlotEvent.HOVER, ({ selection }) => {
        const point = points.features[selection[0]]?.properties;
        if (!point) { updateLabels(); return; }
        pointStatus.textContent = `${point.airport} · ${point.hour} · ${point.value.toFixed(1)} min median · ${point.count.toLocaleString('en-US')} trips`;
    });
    map?.show(airports, destination, { labels: groups, colorMap });
    updateLabels();
    showHours(null);
    return () => { destinationControl.removeEventListener('change', onDestination); timeline.destroy(); histogram.destroy(); map?.destroy(); };
}

void runExample(async () => onExampleDispose(await main()), true);
