import { SpatialDb } from 'autk-db';
import * as d3 from 'd3';

// ── Configuration ─────────────────────────────────────────────────────────────

const NUM_REPETITIONS = 10;
const SAMPLE_PERCENTAGES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const NOISE_CSV_URL = `${window.location.origin}/data/noise.csv`;
const NEIGHBORHOODS_GEOJSON_URL = `${window.location.origin}/data/mnt_neighs.geojson`;
const LAT_COLUMN = 'Latitude';
const LON_COLUMN = 'Longitude';

// ── Data types ────────────────────────────────────────────────────────────────

interface RunResult {
    run: number;
    repetition: number;
    samplePercentage: number;
    noiseCount: number;
    joinTimeMs: number;
}

interface StatsPoint {
    samplePercentage: number;
    noiseCountMean: number;
    joinTimeMean: number;
    joinTimeStd: number;
}

// ── Stats helpers ─────────────────────────────────────────────────────────────

function mean(vals: number[]): number {
    return vals.reduce((s, v) => s + v, 0) / vals.length;
}

function stddev(vals: number[]): number {
    if (vals.length < 2) return 0;
    const avg = mean(vals);
    return Math.sqrt(vals.reduce((s, v) => s + (v - avg) ** 2, 0) / (vals.length - 1));
}

function computeStats(runs: RunResult[]): StatsPoint[] {
    const percentages = [...new Set(runs.map((r) => r.samplePercentage))].sort((a, b) => a - b);
    return percentages.map((pct) => {
        const group = runs.filter((r) => r.samplePercentage === pct);
        const joinTimes = group.map((r) => r.joinTimeMs);
        return {
            samplePercentage: pct,
            noiseCountMean: mean(group.map((r) => r.noiseCount)),
            joinTimeMean: mean(joinTimes),
            joinTimeStd: stddev(joinTimes),
        };
    });
}

// ── Scientific colour palette ─────────────────────────────────────────────────
// Tableau-10 / Matplotlib default – widely used in scientific figures.

const COLORS: Record<string, string> = {
    join: '#d62728',
    features: '#1f77b4',
};

const color = (key: string) => COLORS[key] ?? '#8c8c8c';

// ── Chart infrastructure ──────────────────────────────────────────────────────

const FONT = "'Helvetica Neue', Arial, sans-serif";
const M = { top: 28, right: 24, bottom: 46, left: 64 };
const CHART_H = 240;

// Full available width — capped so charts don't become tiny on narrow screens.
function chartWidth(containerId: string): number {
    const el = document.getElementById(containerId);
    if (!el) return 960;
    const full = el.parentElement?.clientWidth ?? 960;
    return Math.max(640, full - 48) - M.left - M.right;
}

function makeSvg(containerId: string) {
    const w = chartWidth(containerId);
    const h = CHART_H;
    d3.select(`#${containerId}`).select('svg').remove();
    const svg = d3
        .select(`#${containerId}`)
        .append('svg')
        .attr('width', w + M.left + M.right)
        .attr('height', h + M.top + M.bottom)
        .style('background', '#fff')
        .style('font-family', FONT);
    const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);
    return { svg, g, w, h };
}

function applyAxisStyle(
    sel: d3.Selection<SVGGElement, unknown, HTMLElement, unknown>,
) {
    sel.selectAll<SVGTextElement, unknown>('.tick text')
        .style('font-size', '14px')
        .style('fill', '#444')
        .style('font-family', FONT);
    sel.selectAll<SVGLineElement | SVGPathElement, unknown>('.tick line, .domain')
        .style('stroke', '#888')
        .style('stroke-width', '0.8');
}

function addHGrid(
    g: d3.Selection<SVGGElement, unknown, HTMLElement, unknown>,
    yScale: d3.ScaleLinear<number, number>,
    w: number,
) {
    g.append('g')
        .attr('class', 'grid')
        .call(
            d3.axisLeft(yScale)
                .ticks(5)
                .tickSize(-w)
                .tickFormat(() => ''),
        )
        .call((s) => s.select('.domain').remove())
        .call((s) =>
            s.selectAll('.tick line')
                .style('stroke', '#e0e0e0')
                .style('stroke-width', '0.8'),
        );
}

function addAxisLabels(
    g: d3.Selection<SVGGElement, unknown, HTMLElement, unknown>,
    w: number,
    h: number,
    xLabel: string,
    yLabel: string,
) {
    g.append('text')
        .attr('x', w / 2).attr('y', h + 38)
        .attr('text-anchor', 'middle')
        .style('font-size', '13px').style('fill', '#333').style('font-family', FONT)
        .text(xLabel);
    g.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -h / 2).attr('y', -50)
        .attr('text-anchor', 'middle')
        .style('font-size', '13px').style('fill', '#333').style('font-family', FONT)
        .text(yLabel);
}

function addTitle(
    g: d3.Selection<SVGGElement, unknown, HTMLElement, unknown>,
    w: number,
    title: string,
) {
    g.append('text')
        .attr('x', w / 2).attr('y', -10)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px').style('font-weight', '600')
        .style('fill', '#111').style('font-family', FONT)
        .text(title);
}

function addLineLegend(
    g: d3.Selection<SVGGElement, unknown, HTMLElement, unknown>,
    entries: { key: string; label: string }[],
    x: number,
    y: number,
) {
    const lg = g.append('g').attr('transform', `translate(${x},${y})`);
    entries.forEach(({ key, label }, i) => {
        const row = lg.append('g').attr('transform', `translate(0,${i * 16})`);
        row.append('line')
            .attr('x1', 0).attr('y1', 5).attr('x2', 16).attr('y2', 5)
            .style('stroke', color(key)).style('stroke-width', key === 'total' ? 2 : 1.5);
        row.append('text')
            .attr('x', 20).attr('y', 9)
            .style('font-size', '14px').style('fill', '#333').style('font-family', FONT)
            .text(label);
    });
}

// ── Std-dev band helper ───────────────────────────────────────────────────────

function addStdBand(
    g: d3.Selection<SVGGElement, unknown, HTMLElement, unknown>,
    data: StatsPoint[],
    x: d3.ScaleLinear<number, number>,
    y: d3.ScaleLinear<number, number>,
    xVal: (d: StatsPoint) => number,
    meanVal: (d: StatsPoint) => number,
    stdVal: (d: StatsPoint) => number,
    clr: string,
) {
    if (data.length < 2) return;
    g.append('path')
        .datum(data)
        .attr('fill', clr)
        .attr('fill-opacity', 0.15)
        .attr('stroke', 'none')
        .attr('d', d3.area<StatsPoint>()
            .x((d) => x(xVal(d)))
            .y0((d) => y(Math.max(0, meanVal(d) - stdVal(d))))
            .y1((d) => y(meanVal(d) + stdVal(d)))
            .curve(d3.curveLinear));
}

// ── Chart 1 – Join time (mean ± 1σ) vs. sample percentage ────────────────────

function chartTime(runs: RunResult[]) {
    if (runs.length === 0) return;
    const { g, w, h } = makeSvg('chart-time');
    const stats = computeStats(runs);

    const x = d3.scaleLinear().domain([0, 100]).range([0, w]);
    const maxY = stats.length > 0
        ? d3.max(stats, (d) => d.joinTimeMean + d.joinTimeStd)! * 1.15
        : d3.max(runs, (r) => r.joinTimeMs)! * 1.15;
    const y = d3.scaleLinear().domain([0, maxY]).range([h, 0]);

    addHGrid(g, y, w);

    const xAxisSel = g.append('g').attr('transform', `translate(0,${h})`)
        .call(d3.axisBottom(x).ticks(10).tickFormat((d) => `${d}%`));
    const yAxisSel = g.append('g')
        .call(d3.axisLeft(y).ticks(5).tickFormat((v) => `${+v / 1000}s`));
    applyAxisStyle(xAxisSel); applyAxisStyle(yAxisSel);

    // ±1σ band
    addStdBand(g, stats, x, y,
        (d) => d.samplePercentage, (d) => d.joinTimeMean, (d) => d.joinTimeStd,
        color('join'));

    // Individual rep dots (faint)
    g.selectAll<SVGCircleElement, RunResult>('circle.raw')
        .data(runs)
        .join('circle')
        .attr('class', 'raw')
        .attr('cx', (r) => x(r.samplePercentage))
        .attr('cy', (r) => y(r.joinTimeMs))
        .attr('r', 2)
        .attr('fill', color('join'))
        .attr('opacity', 0.3);

    // Mean line
    g.append('path')
        .datum(stats)
        .attr('fill', 'none')
        .attr('stroke', color('join'))
        .attr('stroke-width', 2)
        .attr('d', d3.line<StatsPoint>()
            .x((d) => x(d.samplePercentage))
            .y((d) => y(d.joinTimeMean))
            .curve(d3.curveLinear));

    // Mean dots
    g.selectAll<SVGCircleElement, StatsPoint>('circle.mean')
        .data(stats)
        .join('circle')
        .attr('class', 'mean')
        .attr('cx', (d) => x(d.samplePercentage))
        .attr('cy', (d) => y(d.joinTimeMean))
        .attr('r', 3.5)
        .attr('fill', color('join'));

    addLineLegend(g, [{ key: 'join', label: `Join Time (mean ± 1σ, n=${NUM_REPETITIONS})` }], 20, 0);
    addAxisLabels(g, w, h, 'Sample Percentage', 'Join Time (ms)');
    addTitle(g, w, 'Join Time vs. Sample Percentage');
}

// ── Chart 2 – Noise count (mean ± 1σ) vs. sample percentage ──────────────────

function chartFeatures(runs: RunResult[]) {
    if (runs.length === 0) return;
    const { g, w, h } = makeSvg('chart-features');
    const stats = computeStats(runs);

    const x = d3.scaleLinear().domain([0, 100]).range([0, w]);
    const maxY = stats.length > 0
        ? d3.max(stats, (d) => d.noiseCountMean)! * 1.15
        : d3.max(runs, (d) => d.noiseCount)! * 1.15;
    const y = d3.scaleLinear().domain([0, maxY]).range([h, 0]);

    addHGrid(g, y, w);

    const xAxisSel = g.append('g').attr('transform', `translate(0,${h})`)
        .call(d3.axisBottom(x).ticks(10).tickFormat((d) => `${d}%`));
    const yAxisSel = g.append('g').call(d3.axisLeft(y).ticks(5).tickFormat((v) => `${+v / 1e6}M`));
    applyAxisStyle(xAxisSel); applyAxisStyle(yAxisSel);

    // Individual rep dots (faint)
    g.selectAll<SVGCircleElement, RunResult>('circle.raw')
        .data(runs)
        .join('circle')
        .attr('class', 'raw')
        .attr('cx', (d) => x(d.samplePercentage))
        .attr('cy', (d) => y(d.noiseCount))
        .attr('r', 2)
        .attr('fill', color('features'))
        .attr('opacity', 0.3);

    // Mean line
    g.append('path').datum(stats)
        .attr('fill', 'none').attr('stroke', color('features')).attr('stroke-width', 2)
        .attr('d', d3.line<StatsPoint>()
            .x((d) => x(d.samplePercentage))
            .y((d) => y(d.noiseCountMean))
            .curve(d3.curveLinear));

    // Mean dots
    g.selectAll<SVGCircleElement, StatsPoint>('circle.mean')
        .data(stats).join('circle')
        .attr('class', 'mean')
        .attr('cx', (d) => x(d.samplePercentage))
        .attr('cy', (d) => y(d.noiseCountMean))
        .attr('r', 3.5).attr('fill', color('features'));

    addLineLegend(g, [{ key: 'features', label: `Complaints (mean, n=${NUM_REPETITIONS})` }], 20, 0);
    addAxisLabels(g, w, h, 'Sample Percentage', 'Complaints (count)');
    addTitle(g, w, 'Complaints vs. Sample Percentage');
}

// ── Chart 3 – Join time (mean ± 1σ) vs. complaint count ──────────────────────

function chartScatter(runs: RunResult[]) {
    if (runs.length === 0) return;
    const { g, w, h } = makeSvg('chart-scatter');
    const stats = computeStats(runs);

    const maxX = stats.length > 0
        ? d3.max(stats, (d) => d.noiseCountMean)! * 1.1
        : d3.max(runs, (d) => d.noiseCount)! * 1.1;
    const maxY = stats.length > 0
        ? d3.max(stats, (d) => d.joinTimeMean + d.joinTimeStd)! * 1.1
        : d3.max(runs, (d) => d.joinTimeMs)! * 1.1;

    const x = d3.scaleLinear().domain([0, maxX]).range([0, w]);
    const y = d3.scaleLinear().domain([0, maxY]).range([h, 0]);

    addHGrid(g, y, w);

    const xAxisSel = g.append('g').attr('transform', `translate(0,${h})`)
        .call(d3.axisBottom(x).ticks(5).tickFormat((v) => `${+v / 1e6}M`));
    const yAxisSel = g.append('g')
        .call(d3.axisLeft(y).ticks(5).tickFormat((v) => `${+v / 1000}s`));
    applyAxisStyle(xAxisSel); applyAxisStyle(yAxisSel);

    // ±1σ band (vertical, over noise count mean)
    addStdBand(g, stats, x, y,
        (d) => d.noiseCountMean, (d) => d.joinTimeMean, (d) => d.joinTimeStd,
        color('join'));

    // Individual rep dots (faint)
    g.selectAll<SVGCircleElement, RunResult>('circle.raw')
        .data(runs)
        .join('circle')
        .attr('class', 'raw')
        .attr('cx', (d) => x(d.noiseCount))
        .attr('cy', (d) => y(d.joinTimeMs))
        .attr('r', 2)
        .attr('fill', color('join'))
        .attr('opacity', 0.3);

    // Mean line
    g.append('path')
        .datum(stats)
        .attr('fill', 'none')
        .attr('stroke', color('join'))
        .attr('stroke-width', 2)
        .attr('d', d3.line<StatsPoint>()
            .x((d) => x(d.noiseCountMean))
            .y((d) => y(d.joinTimeMean))
            .curve(d3.curveLinear));

    // Mean dots
    g.selectAll<SVGCircleElement, StatsPoint>('circle.mean')
        .data(stats).join('circle')
        .attr('class', 'mean')
        .attr('cx', (d) => x(d.noiseCountMean))
        .attr('cy', (d) => y(d.joinTimeMean))
        .attr('r', 3.5)
        .attr('fill', color('join'));

    addLineLegend(g, [{ key: 'join', label: `Spatial join (mean ± 1σ, n=${NUM_REPETITIONS})` }], 20, 0);
    addAxisLabels(g, w, h, 'Complaint count', 'Spatial join time');
    addTitle(g, w, 'Autark\'s spatial join performance');
}

// ── Render all charts ─────────────────────────────────────────────────────────

const CHART_IDS = ['chart-time', 'chart-features', 'chart-scatter'];

function renderCharts(runs: RunResult[]) {
    if (runs.length === 0) return;
    chartTime(runs);
    chartFeatures(runs);
    chartScatter(runs);
    document.getElementById('charts-section')!.style.display = 'flex';
}

// ── Persistence: save to public/data/ via Vite dev plugin ────────────────────

async function saveToServer(filename: string, content: string, encoding: 'utf-8' | 'base64' = 'utf-8') {
    const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content, encoding }),
    });
    if (!res.ok) throw new Error(`Save failed: ${await res.text()}`);
}

async function saveDataFiles(runResults: RunResult[]) {
    await saveToServer('join-runs.csv', buildRunsCsv(runResults));
}

// ── Auto-load existing CSV files on startup ───────────────────────────────────

async function tryLoadExistingData(): Promise<{ runs: RunResult[] } | null> {
    try {
        const runsRes = await fetch('/data/join-runs.csv');
        if (!runsRes.ok) return null;
        const runsText = await runsRes.text();
        return {
            runs: parseRunsCsv(runsText),
        };
    } catch {
        return null;
    }
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

function buildRunsCsv(results: RunResult[]): string {
    const header = 'run,repetition,sample_percentage,noise_count,join_time_ms';
    const rows = results.map((r) =>
        [r.run, r.repetition, r.samplePercentage, r.noiseCount, r.joinTimeMs.toFixed(1)].join(','),
    );
    return [header, ...rows].join('\n');
}

function parseRunsCsv(text: string): RunResult[] {
    const lines = text.trim().split('\n').slice(1);
    return lines.map((line) => {
        const match = line.split(',');
        if (match.length < 5) return null;
        return {
            run: +match[0], repetition: +match[1], samplePercentage: +match[2],
            noiseCount: +match[3], joinTimeMs: +match[4],
        } as RunResult;
    }).filter((r): r is RunResult => r !== null);
}

// ── PNG export ────────────────────────────────────────────────────────────────

async function exportPng() {
    const elements = CHART_IDS
        .map((id) => ({ id, svg: document.querySelector<SVGSVGElement>(`#${id} svg`) }))
        .filter((e): e is { id: string; svg: SVGSVGElement } => e.svg !== null);

    if (elements.length === 0) return;

    for (const { id, svg } of elements) {
        const w = parseInt(svg.getAttribute('width') ?? '960');
        const h = parseInt(svg.getAttribute('height') ?? '320');

        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);

        const clone = svg.cloneNode(true) as SVGSVGElement;

        const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' });
        const imgUrl = URL.createObjectURL(blob);
        await new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.onload = () => { ctx.drawImage(img, 0, 0, w, h); URL.revokeObjectURL(imgUrl); resolve(); };
            img.onerror = reject;
            img.src = imgUrl;
        });

        const filename = `join-${id}.png`;
        const dataUrl = canvas.toDataURL('image/png');
        const base64 = dataUrl.split(',')[1];
        try {
            await saveToServer(filename, base64, 'base64');
        } catch (e) {
            console.warn(`Could not save ${filename} to server, triggering download instead:`, e);
        }
        const a = document.createElement('a');
        a.href = dataUrl; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
}

// ── Benchmark ─────────────────────────────────────────────────────────────────

class LoadingBenchmark {
    private runResults: RunResult[] = [];

    private statusEl = document.getElementById('status')!;
    private progressBar = document.getElementById('progress-bar')! as HTMLElement;
    private progressText = document.getElementById('progress-text')!;
    private tableBody = document.getElementById('results-body')!;
    private downloadCsvBtn = document.getElementById('download-csv-btn')! as HTMLButtonElement;
    private downloadPngBtn = document.getElementById('download-png-btn')! as HTMLButtonElement;

    async run() {
        this.setStatus('Initializing spatial database...');
        this.downloadCsvBtn.disabled = true;
        this.downloadPngBtn.disabled = true;

        // Clear previous state, table, and charts for a fresh run
        this.runResults = [];
        this.tableBody.innerHTML = '';
        document.getElementById('charts-section')!.style.display = 'none';

        try {
            const db = new SpatialDb();
            await db.init();

            await this.loadBaseData(db);

            const totalSteps = SAMPLE_PERCENTAGES.length * NUM_REPETITIONS;
            for (let i = 0; i < SAMPLE_PERCENTAGES.length; i++) {
                const percent = SAMPLE_PERCENTAGES[i];
                const run = i + 1;

                await this.executeJoinForSample(db, run, percent, totalSteps);
            }

            this.setProgress(totalSteps, totalSteps);

            try {
                await saveDataFiles(this.runResults);
                this.setStatus('All runs complete. Results saved to public/data/.');
            } catch (e) {
                this.setStatus('All runs complete. (Could not auto-save to server — use Download CSV.)');
                console.warn('Auto-save failed:', e);
            }
        } catch (globalErr) {
            this.setStatus(`Fatal error during benchmark: ${globalErr}`);
            console.error(globalErr);
        }

        this.downloadCsvBtn.disabled = false;
        this.downloadPngBtn.disabled = false;
    }

    private async loadBaseData(db: SpatialDb) {
        this.setStatus('Loading mnt_neighs.geojson...');
        let t0 = performance.now();
        await db.loadCustomLayer({
            geojsonFileUrl: NEIGHBORHOODS_GEOJSON_URL,
            outputTableName: 'neighborhoods',
            coordinateFormat: 'EPSG:3395'
        });
        const geojsonLoadMs = performance.now() - t0;

        this.setStatus('Loading noise.csv...');
        t0 = performance.now();

        // Load CSV without geometry conversion first to safely handle comma decimal separators
        await db.loadCsv({
            csvFileUrl: NOISE_CSV_URL,
            outputTableName: 'noise_raw'
        });

        await db.rawQuery({
            query: `
          SELECT *,
                 ST_Transform(
                   ST_Point(
                     CAST(regexp_replace(CAST("${LON_COLUMN}" AS VARCHAR), ',', '.') AS DOUBLE),
                     CAST(regexp_replace(CAST("${LAT_COLUMN}" AS VARCHAR), ',', '.') AS DOUBLE)
                   ),
                   'EPSG:4326',
                   'EPSG:3395'
                 ) AS geometry
          FROM noise_raw
          WHERE "${LON_COLUMN}" IS NOT NULL AND "${LAT_COLUMN}" IS NOT NULL
            AND TRIM(CAST("${LON_COLUMN}" AS VARCHAR)) <> ''
            AND TRIM(CAST("${LAT_COLUMN}" AS VARCHAR)) <> ''
        `,
            output: { type: 'CREATE_TABLE', tableName: 'noise' }
        });

        await db.removeLayer('noise_raw');
        const csvLoadMs = performance.now() - t0;

        this.renderBaseLoadRow(geojsonLoadMs, csvLoadMs);
    }

    private async executeJoinForSample(db: SpatialDb, run: number, percent: number, totalSteps: number) {
        const completedBefore = (run - 1) * NUM_REPETITIONS;

        for (let rep = 1; rep <= NUM_REPETITIONS; rep++) {
            this.setStatus(`Run ${run} / ${SAMPLE_PERCENTAGES.length}, rep ${rep} / ${NUM_REPETITIONS} — sampling ${percent}% of noise data...`);
            this.setProgress(completedBefore + rep - 1, totalSteps);

            const tag = `${percent}_r${rep}`;
            try {
                await db.rawQuery({
                    query: `SELECT * FROM noise USING SAMPLE ${percent} PERCENT`,
                    output: { type: 'CREATE_TABLE', tableName: `noise_sample_${tag}` }
                });

                const countRes = await db.rawQuery<{ c: number }[]>({
                    query: `SELECT COUNT(*) as c FROM noise_sample_${tag}`,
                    output: { type: 'RETURN_OBJECT' }
                }) as { c: number }[];
                const noiseCount = Number(countRes[0].c);

                this.setStatus(`Run ${run} / ${SAMPLE_PERCENTAGES.length}, rep ${rep} / ${NUM_REPETITIONS} — joining ${noiseCount} noise points with neighborhoods...`);
                const tJoin0 = performance.now();
                await db.spatialJoin({
                    tableRootName: 'neighborhoods',
                    tableJoinName: `noise_sample_${tag}`,
                    spatialPredicate: 'INTERSECT',
                    output: {
                        type: 'CREATE_NEW',
                        tableName: `join_result_${tag}`
                    },
                    joinType: 'LEFT',
                    groupBy: {
                        selectColumns: [
                            {
                                tableName: `noise_sample_${tag}`,
                                column: 'Unique Key',
                                aggregateFn: 'count',
                            },
                        ],
                    },
                });
                const joinTimeMs = performance.now() - tJoin0;

                // Clean up temporary tables to prevent memory exhaustion
                await db.removeLayer(`noise_sample_${tag}`);
                await db.removeLayer(`join_result_${tag}`);

                const result: RunResult = { run, repetition: rep, samplePercentage: percent, noiseCount, joinTimeMs };
                this.runResults.push(result);
                this.renderRepRow(result);
                renderCharts(this.runResults);

            } catch (err) {
                console.error(`Run ${run} rep ${rep} failed:`, err);
                this.appendErrorRow(run, rep, String(err));
            }
        }

        // Stats summary row after all reps for this sample percentage
        const repsForPct = this.runResults.filter((r) => r.samplePercentage === percent);
        if (repsForPct.length > 0) {
            this.renderStatsRow(percent, repsForPct);
        }

        this.setProgress(completedBefore + NUM_REPETITIONS, totalSteps);
    }

    private renderBaseLoadRow(geojsonMs: number, csvMs: number) {
        const tr = document.createElement('tr');
        tr.style.backgroundColor = '#fafafa';
        tr.innerHTML = `
      <td colspan="2"><b>Base Data Load</b></td><td>—</td>
      <td>GeoJSON: ${geojsonMs.toFixed(0)} ms</td>
      <td>CSV: ${csvMs.toFixed(0)} ms</td>`;
        this.tableBody.appendChild(tr);
    }

    private renderRepRow(t: RunResult) {
        const tr = document.createElement('tr');
        tr.style.color = '#888';
        tr.innerHTML = `
      <td>${t.run}</td>
      <td>${t.repetition}</td>
      <td>${t.samplePercentage}%</td>
      <td>${t.noiseCount.toLocaleString()}</td>
      <td>${t.joinTimeMs.toFixed(0)}</td>`;
        this.tableBody.appendChild(tr);
    }

    private renderStatsRow(percent: number, reps: RunResult[]) {
        const joinTimes = reps.map((r) => r.joinTimeMs);
        const noiseCounts = reps.map((r) => r.noiseCount);
        const avgTime = mean(joinTimes);
        const sdTime = stddev(joinTimes);
        const avgNoise = mean(noiseCounts);
        const tr = document.createElement('tr');
        tr.style.fontWeight = 'bold';
        tr.style.backgroundColor = '#f0f4ff';
        tr.innerHTML = `
      <td>—</td>
      <td>μ ± σ</td>
      <td>${percent}%</td>
      <td>${Math.round(avgNoise).toLocaleString()}</td>
      <td>${avgTime.toFixed(0)} ± ${sdTime.toFixed(0)}</td>`;
        this.tableBody.appendChild(tr);
    }

    private appendErrorRow(run: number, rep: number, message: string) {
        const tr = document.createElement('tr');
        tr.className = 'error-row';
        tr.innerHTML = `<td>${run}</td><td>${rep}</td><td colspan="5">ERROR: ${message}</td>`;
        this.tableBody.appendChild(tr);
    }

    downloadCsv() {
        const content = buildRunsCsv(this.runResults);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([content], { type: 'text/csv' }));
        a.download = 'join-runs.csv';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }

    loadFromData(runs: RunResult[]) {
        this.runResults = runs;
        const bySample = new Map<number, RunResult[]>();
        for (const r of runs) {
            const arr = bySample.get(r.samplePercentage) ?? [];
            arr.push(r);
            bySample.set(r.samplePercentage, arr);
        }
        for (const [percent, reps] of [...bySample.entries()].sort((a, b) => a[0] - b[0])) {
            reps.forEach((r) => this.renderRepRow(r));
            this.renderStatsRow(percent, reps);
        }
        const totalSteps = SAMPLE_PERCENTAGES.length * NUM_REPETITIONS;
        this.setProgress(runs.length, totalSteps);
        this.downloadCsvBtn.disabled = false;
        this.downloadPngBtn.disabled = false;
    }

    private setStatus(msg: string) {
        this.statusEl.textContent = msg;
        console.log('[benchmark]', msg);
    }

    private setProgress(done: number, total: number) {
        const pct = Math.round((done / total) * 100);
        this.progressBar.style.width = `${pct}%`;
        this.progressText.textContent = `${done} / ${total}`;
    }
}

// ── Boot ──────────────────────────────────────────────────────────────────────

const benchmark = new LoadingBenchmark();

(async () => {
    const existing = await tryLoadExistingData();
    if (existing && existing.runs.length > 0) {
        document.getElementById('status')!.textContent =
            `Loaded ${existing.runs.length} existing runs from public/data/. Press "Re-run Benchmark" to overwrite.`;
        document.getElementById('start-btn')!.textContent = '↺ Re-run Benchmark';
        benchmark.loadFromData(existing.runs);
        renderCharts(existing.runs);
    }
})();

document.getElementById('start-btn')!.addEventListener('click', () => {
    (document.getElementById('start-btn') as HTMLButtonElement).disabled = true;
    benchmark.run();
});

document.getElementById('download-csv-btn')!.addEventListener('click', () => {
    benchmark.downloadCsv();
});

document.getElementById('download-png-btn')!.addEventListener('click', async () => {
    const btn = document.getElementById('download-png-btn') as HTMLButtonElement;
    btn.disabled = true; btn.textContent = 'Exporting…';
    await exportPng().catch(console.error);
    btn.disabled = false; btn.textContent = '⬇ PNG';
});
