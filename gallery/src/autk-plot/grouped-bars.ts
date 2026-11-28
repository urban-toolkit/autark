import { ColorMapDomainStrategy } from '@urban-toolkit/autk-core';
import type { ColorMapOptions } from '@urban-toolkit/autk-core';
import { AutkPlot, PlotEvent } from '@urban-toolkit/autk-plot';
import { onExampleDispose, runExample } from '../example';
import { chartCollection, destinations, hours, loadTaxiData, origins, taxiMap, zoneOptions } from './reference-data';
import type { TaxiTrip } from './reference-data';

const limit = 400;
const labels = ['Weekday', 'Weekend'];
const colors = ['#126a82', '#ad501f'] as const;

async function main(): Promise<() => void> {
    const { routes, zones, zoneData } = await loadTaxiData();
    const pickupControl = document.querySelector<HTMLSelectElement>('#taxi-pickup')!;
    const destinationControl = document.querySelector<HTMLSelectElement>('#taxi-destination')!;
    const roleControl = document.querySelector<HTMLSelectElement>('#taxi-role')!;
    const status = document.querySelector<HTMLElement>('#taxi-route-status')!;
    const sampleStatus = document.querySelector<HTMLElement>('#taxi-sample-status')!;
    const scatterHosts = ['#taxi-weekday', '#taxi-weekend'].map(id => document.querySelector<HTMLElement>(id)!);
    const hourHost = document.querySelector<HTMLElement>('#taxi-hourly')!;
    let pickup = 237, destination = 230;
    let plots: AutkPlot[] = [];
    const map = await taxiMap(zoneData, [...new Set([...origins, ...destinations])], id => {
        if (roleControl.value === 'pickup' && origins.includes(id) && id !== destination) {
            pickupControl.value = String(id);
            updateRoute();
        } else if (roleControl.value === 'destination' && destinations.includes(id) && id !== pickup) {
            destinationControl.value = String(id);
            updateRoute();
        }
    }, true);

    function updateRoute() {
        pickup = Number(pickupControl.value);
        destination = Number(destinationControl.value);
        if (destination === pickup) destination = destinations.find(id => id !== pickup)!;
        zoneOptions(destinationControl, destinations.filter(id => id !== pickup), zones, destination);
        plots.forEach(plot => plot.destroy());
        const trips = routes.get(`${pickup}:${destination}`) ?? [];
        const cohorts: TaxiTrip[][] = [trips.filter(trip => !trip.weekend), trips.filter(trip => trip.weekend)];
        const sampled = cohorts.map(cohort => cohort.slice(0, limit));
        const rows = sampled.map((cohort, index) => cohort.map(trip => ({ ...trip, cohort: labels[index], hourLabel: hours[trip.hour] })));
        const combined = rows.flat();
        const bounds = {
            x: { domain: [0, Math.max(5, Math.ceil(Math.max(...combined.map(trip => trip.minutes)) / 5) * 5)] as [number, number] },
            y: { domain: [0, Math.max(5, Math.ceil(Math.max(...combined.map(trip => trip.fare)) / 5) * 5)] as [number, number] },
        };
        const style: { colorMap: ColorMapOptions; radius: number } = { radius: 3, colorMap: {
            type: 'categorical', colors, domainSpec: { type: ColorMapDomainStrategy.USER, params: labels },
        } };
        const scatters = rows.map((cohort, i) => {
            const plot = new AutkPlot(scatterHosts[i], {
                type: 'scatterplot', collection: chartCollection(cohort), width: 'auto', height: 290,
                attributes: { axis: ['minutes', 'fare'], color: 'cohort' }, scales: bounds, style,
                labels: { axis: ['Trip duration (minutes)', 'Metered fare ($)'] },
                margins: { top: 16, right: 18, bottom: 48, left: 60 }, events: [PlotEvent.BRUSH, PlotEvent.CLICK],
            });
            plot.setAnnotations([
                { id: 'fit', type: 'line', fit: 'linear', label: 'Fit', color: '#384859' },
                { id: 'centroid', type: 'point', x: 'mean', y: 'mean', label: 'Centroid', color: '#384859' },
            ]);
            return plot;
        });
        const hourly = new AutkPlot(hourHost, {
            type: 'barchart', collection: chartCollection(combined), width: 'auto', height: 235,
            attributes: { axis: ['hourLabel', '@transform'] }, transform: { preset: 'binning-1d', options: { reducer: 'count' } },
            scales: { x: { domain: hours } }, ticks: { x: { label: hour => +hour.slice(0, 2) % 3 === 0 ? hour : '' } },
            labels: { title: '', axis: ['Pickup hour (NYC local time)', 'Sampled trips'] },
            margins: { top: 14, right: 20, bottom: 52, left: 58 }, events: [PlotEvent.CLICK],
        });
        const offset = sampled[0].length;
        const setStatus = (selected: number) => {
            sampleStatus.textContent = `${sampled[0].length} weekday · ${sampled[1].length} weekend sampled trips${selected ? ` · ${selected} selected` : ''}`;
        };
        scatters.forEach((scatter, i) => {
            for (const event of [PlotEvent.BRUSH, PlotEvent.CLICK] as const) {
                scatter.events.on(event, ({ selection }) => {
                    scatters[1 - i].setSelection([]);
                    hourly.setSelection(selection.map(id => id + (i === 1 ? offset : 0)));
                    setStatus(selection.length);
                });
            }
        });
        hourly.events.on(PlotEvent.CLICK, ({ selection, shares }) => {
            scatters.forEach((scatter, i) => {
                const ids = selection.filter(id => i === 0 ? id < offset : id >= offset);
                const offsetBy = i === 0 ? 0 : offset;
                const localShares = shares && Object.fromEntries(ids.map(id => [id - offsetBy, shares[id]]));
                scatter.setSelection(ids.map(id => id - offsetBy), localShares);
            });
            setStatus(selection.length);
        });
        plots = [...scatters, hourly];
        status.textContent = `${zones.get(pickup)!.name} → ${zones.get(destination)!.name} · ${trips.length.toLocaleString('en-US')} trips before sampling`;
        setStatus(0);
        map?.show([pickup], destination);
    }

    zoneOptions(pickupControl, origins, zones, pickup);
    zoneOptions(destinationControl, destinations, zones, destination);
    for (const select of [pickupControl, destinationControl]) select.addEventListener('change', updateRoute);
    updateRoute();
    return () => {
        for (const select of [pickupControl, destinationControl]) select.removeEventListener('change', updateRoute);
        plots.forEach(plot => plot.destroy());
        map?.destroy();
    };
}

void runExample(async () => onExampleDispose(await main()), true);
