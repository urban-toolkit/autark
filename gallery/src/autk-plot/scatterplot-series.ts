import { csvParse } from 'd3-dsv';
import type { FeatureCollection, Point } from 'geojson';
import { ColorMapDomainStrategy } from '@urban-toolkit/autk-core';
import { AutkPlot, PlotEvent } from '@urban-toolkit/autk-plot';
import { onExampleDispose, runExample } from '../example';

const groups = ['Weekdays', 'Weekends'] as const;
const hours = Array.from({ length: 24 }, (_, hour) => `2000-01-01T${String(hour).padStart(2, '0')}:00:00Z`);
const timeLabel = (key: string) => key.slice(11, 16);

type Report = { date: string; hour: number; group: typeof groups[number]; longitude: number; latitude: number };

async function main(): Promise<() => void> {
    const response = await fetch(`${import.meta.env.BASE_URL}data/noise_manhattan_clean.csv`);
    if (!response.ok) throw new Error(`Unable to load Manhattan noise reports (${response.status}).`);
    const reports: Report[] = [];
    for (const row of csvParse(await response.text())) {
        const time = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{1,2}):\d{2}:\d{2} (AM|PM)$/.exec(row.date);
        if (!time || !row.longitude.trim() || !row.latitude.trim()) continue;
        const [, month, day, year, clock, period] = time;
        const weekday = new Date(Date.UTC(+year, +month - 1, +day)).getUTCDay();
        const longitude = Number(row.longitude), latitude = Number(row.latitude);
        if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;
        reports.push({ date: `${year}-${month}-${day}`, hour: +clock % 12 + (period === 'PM' ? 12 : 0),
            group: weekday === 0 || weekday === 6 ? 'Weekends' : 'Weekdays', longitude, latitude });
    }
    if (reports.length === 0) throw new Error('No valid reports in the sample.');
    const days = new Map(groups.map(group => [group, new Set(reports.filter(row => row.group === group).map(row => row.date)).size]));
    const collection: FeatureCollection<Point> = {
        type: 'FeatureCollection', features: reports.map(report => ({
            type: 'Feature', geometry: { type: 'Point', coordinates: [report.longitude, report.latitude] },
            properties: { ...report, hourly: [{ timestamp: hours[report.hour], value: 1 / days.get(report.group)! }] },
        })),
    };
    // Use the same source indexes in both plots: each source feature is one report.
    const timeline = new AutkPlot(document.querySelector<HTMLElement>('#noiseTimeline')!, {
        type: 'linechart', collection, width: 'auto', height: 360,
        attributes: { axis: ['hourly'], series: 'group' },
        transform: { preset: 'reduce-series', options: { reducer: 'sum' } },
        scales: { x: { domain: hours } },
        ticks: { x: { label: key => +key.slice(11, 13) % 3 === 0 ? timeLabel(key) : '' } },
        labels: { title: '', axis: ['Hour of day (local)', 'Reports per day'] },
        margins: { top: 38, right: 20, bottom: 62, left: 58 },
        style: { colorMap: { type: 'categorical', colors: ['#126a82', '#aa4619'],
            domainSpec: { type: ColorMapDomainStrategy.USER, params: [...groups] } } },
        events: [PlotEvent.CLICK, PlotEvent.BRUSH],
    });
    const locations = new AutkPlot(document.querySelector<HTMLElement>('#noiseLocations')!, {
        type: 'hexbin', collection, width: 'auto', height: 360,
        attributes: { axis: ['longitude', 'latitude'], color: '@transform' },
        transform: { preset: 'binning-hex', options: { radius: 10 } },
        labels: { title: '', axis: ['Longitude', 'Latitude'] },
        margins: { top: 20, right: 25, bottom: 52, left: 72 },
        ticks: { x: { format: '.2f', count: 4 }, y: { format: '.2f', count: 5 } },
        style: { colorMap: { type: 'sequential', colors: ['#d4e5e8', '#4c7b88', '#244857'] } },
        events: [PlotEvent.CLICK],
    });

    const weekendCounts = Array<number>(24).fill(0);
    for (const report of reports) if (report.group === 'Weekends') weekendCounts[report.hour]++;
    const peak = weekendCounts.indexOf(Math.max(...weekendCounts));
    timeline.setAnnotations([
        { id: 'overnight', type: 'band', x: [hours[0], hours[5]], label: 'Overnight', color: '#126a82' },
        { id: 'mean', type: 'line', y: 'mean', label: 'Mean hourly rate', color: '#526073' },
        { id: 'peak', type: 'point', series: 'Weekends', x: hours[peak], label: 'Weekend peak' },
    ]);
    document.querySelector<HTMLElement>('[data-example-status]')!.textContent = `${days.get('Weekdays')} weekdays · ${days.get('Weekends')} weekend days`;
    for (const event of [PlotEvent.CLICK, PlotEvent.BRUSH] as const) {
        timeline.events.on(event, ({ selection }) => locations.setSelection(selection));
    }
    locations.events.on(PlotEvent.CLICK, ({ selection }) => timeline.setSelection(selection));
    return () => { timeline.destroy(); locations.destroy(); };
}

void runExample(async () => onExampleDispose(await main()), true);
