import { SpatialDb } from 'autk-db';
import type { OsmLoadTimings } from 'autk-db';
import { AutkMap, LayerType } from 'autk-map';
import * as d3 from 'd3';

// ── Configuration ─────────────────────────────────────────────────────────────

const GEOCODE_AREA = 'New York';
const LAYERS = ['surface', 'parks', 'water', 'roads', 'buildings'] as const;
const COORDINATE_FORMAT = 'EPSG:3395';
const INTER_RUN_COOLDOWN_S = 20;

const NEIGHBORHOODS = [
  'Battery Park City',
  'Financial District',
  'Tribeca',
  'SoHo',
  'Greenwich Village',
  'Chelsea',
  "Hell's Kitchen",
  'East Village',
  'Lower East Side',
  'Harlem',
];

// ── Data types ────────────────────────────────────────────────────────────────

interface RunResult {
  run: number;
  neighborhoodCount: number;
  neighborhoods: string;
  osmElementCount: number;
  boundaryElementCount: number;
  osmDataProcessingMs: number;
  boundariesProcessingMs: number;
  dbTotalMs: number;
  mapInitMs: number;
  mapTotalMs: number;
}

interface LayerResult {
  run: number;
  neighborhoodCount: number;
  layerName: string;
  layerType: string;
  loadMs: number;
  featureCount: number;
  mapLoadMs: number;
}

// ── Scientific colour palette ─────────────────────────────────────────────────
// Tableau-10 / Matplotlib default – widely used in scientific figures.

const COLORS: Record<string, string> = {
  total:     '#888888',
  db:        '#1f77b4',
  map:       '#ff7f0e',
  surface:   '#888888',
  parks:     '#2ca02c',
  water:     '#17becf',
  roads:     '#d62728',
  buildings: '#9467bd',
};

const LAYER_TYPE_MAP: Record<string, LayerType> = {
  surface:   LayerType.AUTK_OSM_SURFACE,
  parks:     LayerType.AUTK_OSM_PARKS,
  water:     LayerType.AUTK_OSM_WATER,
  roads:     LayerType.AUTK_OSM_ROADS,
  buildings: LayerType.AUTK_OSM_BUILDINGS,
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

// ── Chart 1 – Time per layer + total vs. neighborhood count ───────────────────

function chartTime(runs: RunResult[], layers: LayerResult[]) {
  if (runs.length === 0) return;
  const { g, w, h } = makeSvg('chart-time');

  const layerTypes = [...new Set(layers.map((l) => l.layerType))];

  // Build series: { neighborhoodCount, [layerType]: ms, total: ms }
  const byRun = new Map<number, RunResult>(runs.map((r) => [r.run, r]));

  const x = d3.scaleLinear()
    .domain([1, d3.max(runs, (d) => d.neighborhoodCount)!])
    .range([0, w]);

  const allTimes = [
    ...runs.map((r) => r.dbTotalMs),
    ...runs.map((r) => r.mapTotalMs),
    ...layers.map((l) => l.loadMs),
  ];
  const y = d3.scaleLinear().domain([0, d3.max(allTimes)! * 1.15]).range([h, 0]);

  addHGrid(g, y, w);

  const xAxisSel = g.append('g').attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(x).ticks(runs.length).tickFormat(d3.format('d')));
  const yAxisSel = g.append('g')
    .call(d3.axisLeft(y).ticks(5).tickFormat((v) => `${v} ms`));
  applyAxisStyle(xAxisSel); applyAxisStyle(yAxisSel);

  const lineGen = (yVal: (r: RunResult) => number) =>
    d3.line<RunResult>()
      .x((r) => x(r.neighborhoodCount))
      .y((r) => y(yVal(r)))
      .curve(d3.curveLinear);

  // Layer lines
  for (const lt of layerTypes) {
    const pts = layers
      .filter((l) => l.layerType === lt)
      .map((l) => byRun.get(l.run)!)
      .filter(Boolean)
      .sort((a, b) => a.neighborhoodCount - b.neighborhoodCount);
    const layerMs = (r: RunResult) =>
      layers.find((l) => l.run === r.run && l.layerType === lt)?.loadMs ?? 0;

    g.append('path')
      .datum(pts)
      .attr('fill', 'none')
      .attr('stroke', color(lt))
      .attr('stroke-width', 1.5)
      .attr('d', lineGen(layerMs));

    g.selectAll(`circle.c-${lt}`)
      .data(pts)
      .join('circle')
      .attr('class', `c-${lt}`)
      .attr('cx', (r) => x(r.neighborhoodCount))
      .attr('cy', (r) => y(layerMs(r)))
      .attr('r', 3)
      .attr('fill', color(lt));
  }

  // DB total line
  g.append('path')
    .datum(runs)
    .attr('fill', 'none')
    .attr('stroke', color('total'))
    .attr('stroke-width', 2)
    .attr('d', lineGen((r) => r.dbTotalMs));

  g.selectAll('circle.c-total')
    .data(runs)
    .join('circle')
    .attr('class', 'c-total')
    .attr('cx', (r) => x(r.neighborhoodCount))
    .attr('cy', (r) => y(r.dbTotalMs))
    .attr('r', 3.5)
    .attr('fill', color('total'));

  // Map total line
  g.append('path')
    .datum(runs)
    .attr('fill', 'none')
    .attr('stroke', color('map'))
    .attr('stroke-width', 2)
    .attr('stroke-dasharray', '5,3')
    .attr('d', lineGen((r) => r.mapTotalMs));

  g.selectAll('circle.c-map')
    .data(runs)
    .join('circle')
    .attr('class', 'c-map')
    .attr('cx', (r) => x(r.neighborhoodCount))
    .attr('cy', (r) => y(r.mapTotalMs))
    .attr('r', 3.5)
    .attr('fill', color('map'));

  const legendEntries = [
    { key: 'total', label: 'DB Total' },
    { key: 'map',   label: 'Map Total' },
    ...layerTypes.map((lt) => ({ key: lt, label: lt })),
  ];
  addLineLegend(g, legendEntries, 20, 0);
  addAxisLabels(g, w, h, 'Neighborhoods loaded', 'Processing time (ms)');
  addTitle(g, w, 'DB processing time vs. neighborhoods');
}

// ── Chart 2 – Feature count per layer vs. neighborhood count ──────────────────

function chartFeatures(layers: LayerResult[]) {
  if (layers.length === 0) return;
  const { g, w, h } = makeSvg('chart-features');

  const layerTypes = [...new Set(layers.map((l) => l.layerType))];
  const maxN = d3.max(layers, (d) => d.neighborhoodCount)!;

  // Group by run to calculate total feature count per step
  const runs = [...new Set(layers.map((l) => l.run))];
  const totalData = runs.map((run) => {
    const runLayers = layers.filter((l) => l.run === run);
    return {
      neighborhoodCount: runLayers[0].neighborhoodCount,
      featureCount: d3.sum(runLayers, (l) => l.featureCount),
    };
  }).sort((a, b) => a.neighborhoodCount - b.neighborhoodCount);

  const maxF = d3.max(totalData, (d) => d.featureCount)!;

  const x = d3.scaleLinear().domain([1, maxN]).range([0, w]);
  const y = d3.scaleLinear().domain([0, maxF * 1.15]).range([h, 0]);

  addHGrid(g, y, w);

  const xAxisSel = g.append('g').attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(x).ticks(maxN).tickFormat(d3.format('d')));
  const yAxisSel = g.append('g').call(d3.axisLeft(y).ticks(5));
  applyAxisStyle(xAxisSel); applyAxisStyle(yAxisSel);

  const lineGen = d3
    .line<{ neighborhoodCount: number; featureCount: number }>()
    .x((d) => x(d.neighborhoodCount))
    .y((d) => y(d.featureCount))
    .curve(d3.curveLinear);

  for (const lt of layerTypes) {
    const data = layers
      .filter((l) => l.layerType === lt)
      .sort((a, b) => a.neighborhoodCount - b.neighborhoodCount);

    g.append('path').datum(data)
      .attr('fill', 'none').attr('stroke', color(lt)).attr('stroke-width', 1.5)
      .attr('d', lineGen);

    g.selectAll(`circle.c-${lt}`)
      .data(data).join('circle')
      .attr('class', `c-${lt}`)
      .attr('cx', (d) => x(d.neighborhoodCount))
      .attr('cy', (d) => y(d.featureCount))
      .attr('r', 3).attr('fill', color(lt));
  }

  // Draw total line
  g.append('path').datum(totalData)
    .attr('fill', 'none').attr('stroke', color('total')).attr('stroke-width', 2)
    .attr('d', lineGen);

  g.selectAll('circle.c-total')
    .data(totalData).join('circle')
    .attr('class', 'c-total')
    .attr('cx', (d) => x(d.neighborhoodCount))
    .attr('cy', (d) => y(d.featureCount))
    .attr('r', 3.5).attr('fill', color('total'));

  const legendEntries = [
    { key: 'total', label: 'Total' },
    ...layerTypes.map((lt) => ({ key: lt, label: lt })),
  ];
  addLineLegend(g, legendEntries, 20, 0);
  addAxisLabels(g, w, h, 'Neighborhoods loaded', 'Feature count');
  addTitle(g, w, 'Feature count vs. neighborhoods');
}

// ── Chart 3 – Layer load time vs. feature count (scatter) ────────────────────

function chartScatter(runs: RunResult[], layers: LayerResult[]) {
  if (runs.length === 0) return;
  const { g, w, h } = makeSvg('chart-scatter');

  const data = runs.map((run) => {
    const runLayers = layers.filter((l) => l.run === run.run);
    const featureCount = d3.sum(runLayers, (l) => l.featureCount);
    return {
      featureCount,
      dbMs: run.dbTotalMs,
      mapMs: run.mapTotalMs,
      totalMs: run.dbTotalMs + run.mapTotalMs,
    };
  });

  const x = d3.scaleLinear().domain([0, d3.max(data, (d) => d.featureCount)! * 1.1]).range([0, w]);
  const y = d3.scaleLinear().domain([0, d3.max(data, (d) => d.totalMs)! * 1.1]).range([h, 0]);

  addHGrid(g, y, w);

  const xAxisSel = g.append('g').attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(x).ticks(5));
  const yAxisSel = g.append('g')
    .call(d3.axisLeft(y).ticks(5).tickFormat((v) => `${+v / 1000}s`));
  applyAxisStyle(xAxisSel); applyAxisStyle(yAxisSel);

  const lineGen = (yVal: (d: typeof data[0]) => number) =>
    d3.line<typeof data[0]>()
      .x((d) => x(d.featureCount))
      .y((d) => y(yVal(d)))
      .curve(d3.curveLinear)(data);

  const series: { key: string; label: string; yVal: (d: typeof data[0]) => number; dash?: string; width: number }[] = [
    { key: 'total', label: 'Total', yVal: (d) => d.totalMs, width: 2 },
    { key: 'map',   label: '3D Map',    yVal: (d) => d.mapMs,   width: 1.5, dash: '5,3' },
    { key: 'db',    label: 'Database',     yVal: (d) => d.dbMs,    width: 1.5, dash: '2,3' },
  ];

  series.forEach(({ key, yVal, dash, width }) => {
    g.append('path')
      .attr('fill', 'none')
      .attr('stroke', color(key))
      .attr('stroke-width', width)
      .attr('stroke-dasharray', dash ?? null)
      .attr('d', lineGen(yVal));

    g.selectAll(`circle.cs-${key}`)
      .data(data).join('circle')
      .attr('class', `cs-${key}`)
      .attr('cx', (d) => x(d.featureCount))
      .attr('cy', (d) => y(yVal(d)))
      .attr('r', 3)
      .attr('fill', color(key));
  });

  const legendEntries = series.map(({ key, label }) => ({ key, label }));
  addLineLegend(g, legendEntries, 20, 0);
  addAxisLabels(g, w, h, 'Feature count', 'Loading time');
  addTitle(g, w, 'Autark\'s data loading performance');
}

// ── Render all charts ─────────────────────────────────────────────────────────

const CHART_IDS = ['plot-01', 'plot-02', 'plot-03'];

function renderCharts(runs: RunResult[], layers: LayerResult[]) {
  if (runs.length === 0) return;
  const plotLayers = layers.filter((l) => l.layerType === 'buildings' || l.layerType === 'roads');
  chartTime(runs, plotLayers);
  chartFeatures(plotLayers);
  chartScatter(runs, layers);
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

async function saveDataFiles(runResults: RunResult[], layerResults: LayerResult[]) {
  await saveToServer('loading-runs.csv', buildRunsCsv(runResults));
  await saveToServer('loading-layers.csv', buildLayersCsv(layerResults));
}

// ── Auto-load existing CSV files on startup ───────────────────────────────────

async function tryLoadExistingData(): Promise<{ runs: RunResult[]; layers: LayerResult[] } | null> {
  try {
    const [runsRes, layersRes] = await Promise.all([
      fetch('/data/loading-runs.csv'),
      fetch('/data/loading-layers.csv'),
    ]);
    if (!runsRes.ok || !layersRes.ok) return null;
    const [runsText, layersText] = await Promise.all([runsRes.text(), layersRes.text()]);
    return {
      runs: parseRunsCsv(runsText),
      layers: parseLayersCsv(layersText),
    };
  } catch {
    return null;
  }
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

function buildRunsCsv(results: RunResult[]): string {
  const header = 'run,neighborhood_count,neighborhoods,osm_element_count,boundary_element_count,osm_processing_ms,boundaries_processing_ms,db_total_ms,map_init_ms,map_total_ms';
  const rows = results.map((r) =>
    [r.run, r.neighborhoodCount, `"${r.neighborhoods}"`, r.osmElementCount,
      r.boundaryElementCount, r.osmDataProcessingMs.toFixed(1),
      r.boundariesProcessingMs.toFixed(1), r.dbTotalMs.toFixed(1),
      r.mapInitMs.toFixed(1), r.mapTotalMs.toFixed(1)].join(','),
  );
  return [header, ...rows].join('\n');
}

function buildLayersCsv(results: LayerResult[]): string {
  const header = 'run,neighborhood_count,layer_name,layer_type,load_ms,feature_count,map_load_ms';
  const rows = results.map((l) =>
    [l.run, l.neighborhoodCount, l.layerName, l.layerType,
      l.loadMs.toFixed(1), l.featureCount, l.mapLoadMs.toFixed(1)].join(','),
  );
  return [header, ...rows].join('\n');
}

function parseRunsCsv(text: string): RunResult[] {
  const lines = text.trim().split('\n').slice(1);
  return lines.map((line) => {
    const match = line.match(/^(\d+),(\d+),"([^"]*)",(\d+),(\d+),([\d.]+),([\d.]+),([\d.]+)(?:,([\d.]+),([\d.]+))?$/);
    if (!match) return null;
    return {
      run: +match[1], neighborhoodCount: +match[2], neighborhoods: match[3],
      osmElementCount: +match[4], boundaryElementCount: +match[5],
      osmDataProcessingMs: +match[6], boundariesProcessingMs: +match[7], dbTotalMs: +match[8],
      mapInitMs: +(match[9] ?? 0), mapTotalMs: +(match[10] ?? 0),
    } as RunResult;
  }).filter((r): r is RunResult => r !== null);
}

function parseLayersCsv(text: string): LayerResult[] {
  const lines = text.trim().split('\n').slice(1);
  return lines.map((line) => {
    const [run, neighborhoodCount, layerName, layerType, loadMs, featureCount, mapLoadMs] = line.split(',');
    return {
      run: +run, neighborhoodCount: +neighborhoodCount, layerName, layerType,
      loadMs: +loadMs, featureCount: +featureCount, mapLoadMs: +(mapLoadMs ?? 0),
    } as LayerResult;
  });
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

    const filename = `loading-${id}.png`;
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
  private layerResults: LayerResult[] = [];

  private statusEl = document.getElementById('status')!;
  private progressBar = document.getElementById('progress-bar')! as HTMLElement;
  private progressText = document.getElementById('progress-text')!;
  private tableBody = document.getElementById('results-body')!;
  private downloadCsvBtn = document.getElementById('download-csv-btn')! as HTMLButtonElement;
  private downloadPngBtn = document.getElementById('download-png-btn')! as HTMLButtonElement;

  async run() {
    this.setStatus('Starting… First run may include HTTP download time. Subsequent runs use the 24 h cache.');
    this.downloadCsvBtn.disabled = true;
    this.downloadPngBtn.disabled = true;

    for (let n = 1; n <= NEIGHBORHOODS.length; n++) {
      if (n > 1) await this.countdown(INTER_RUN_COOLDOWN_S, n);

      const areas = NEIGHBORHOODS.slice(0, n);
      this.setStatus(`Run ${n} / ${NEIGHBORHOODS.length} — loading ${n} neighborhood(s): ${areas.join(', ')}`);
      this.setProgress(n - 1, NEIGHBORHOODS.length);

      try {
        const { timings, db } = await this.execRun(n, areas);
        const { mapInitMs, mapLayerMs } = await this.execMapRun(db, timings);
        this.recordRun(n, areas, timings, mapInitMs, mapLayerMs);
        this.renderTableRow(n, areas, timings, mapInitMs + Object.values(mapLayerMs).reduce((s, v) => s + v, 0), mapLayerMs);
        renderCharts(this.runResults, this.layerResults);
      } catch (err) {
        console.error(`Run ${n} failed:`, err);
        this.appendErrorRow(n, String(err));
      }
    }

    this.setProgress(NEIGHBORHOODS.length, NEIGHBORHOODS.length);

    try {
      await saveDataFiles(this.runResults, this.layerResults);
      this.setStatus('All runs complete. Results saved to public/data/.');
    } catch (e) {
      this.setStatus('All runs complete. (Could not auto-save to server — use Download CSV.)');
      console.warn('Auto-save failed:', e);
    }

    this.downloadCsvBtn.disabled = false;
    this.downloadPngBtn.disabled = false;
  }

  private async countdown(seconds: number, nextRun: number) {
    for (let s = seconds; s > 0; s--) {
      this.setStatus(`Cooldown before run ${nextRun} — waiting ${s} s to avoid Overpass API rate limits…`);
      await new Promise<void>((r) => setTimeout(r, 1_000));
    }
  }

  private async execRun(runIndex: number, areas: string[]): Promise<{ timings: OsmLoadTimings; db: SpatialDb }> {
    const db = new SpatialDb();
    await db.init();
    const timings = await db.loadOsmFromOverpassApi({
      queryArea: { geocodeArea: GEOCODE_AREA, areas },
      outputTableName: `table_osm_run${runIndex}`,
      autoLoadLayers: { coordinateFormat: COORDINATE_FORMAT, layers: [...LAYERS], dropOsmTable: true },
    });
    return { timings, db };
  }

  private async execMapRun(db: SpatialDb, timings: OsmLoadTimings): Promise<{ mapInitMs: number; mapLayerMs: Record<string, number> }> {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    canvas.style.position = 'fixed';
    canvas.style.top = '-9999px';
    canvas.style.left = '-9999px';
    canvas.style.visibility = 'hidden';
    document.body.appendChild(canvas);
    try {
      const map = new AutkMap(canvas, false);
      const t0 = performance.now();
      await map.init();
      const mapInitMs = performance.now() - t0;

      const mapLayerMs: Record<string, number> = {};
      for (const layer of timings.layers) {
        const t1 = performance.now();
        const geojson = await db.getLayer(layer.layerName);
        map.loadGeoJsonLayer(layer.layerName, geojson, LAYER_TYPE_MAP[layer.layerType] ?? null);
        mapLayerMs[layer.layerName] = performance.now() - t1;
      }

      return { mapInitMs, mapLayerMs };
    } finally {
      document.body.removeChild(canvas);
    }
  }

  private recordRun(run: number, areas: string[], t: OsmLoadTimings, mapInitMs: number, mapLayerMs: Record<string, number>) {
    const dbTotalMs = t.osmDataProcessingMs + t.boundariesProcessingMs + t.layers.reduce((s, l) => s + l.loadMs, 0);
    const mapTotalMs = mapInitMs + Object.values(mapLayerMs).reduce((s, v) => s + v, 0);
    this.runResults.push({
      run, neighborhoodCount: areas.length, neighborhoods: areas.join('; '),
      osmElementCount: t.osmElementCount, boundaryElementCount: t.boundaryElementCount,
      osmDataProcessingMs: t.osmDataProcessingMs, boundariesProcessingMs: t.boundariesProcessingMs, dbTotalMs,
      mapInitMs, mapTotalMs,
    });
    for (const layer of t.layers) {
      this.layerResults.push({
        run, neighborhoodCount: areas.length, layerName: layer.layerName,
        layerType: layer.layerType, loadMs: layer.loadMs, featureCount: layer.featureCount,
        mapLoadMs: mapLayerMs[layer.layerName] ?? 0,
      });
    }
  }

  private renderTableRow(run: number, areas: string[], t: OsmLoadTimings, mapTotalMs: number, mapLayerMs: Record<string, number>) {
    const dbTotalMs = t.osmDataProcessingMs + t.boundariesProcessingMs + t.layers.reduce((s, l) => s + l.loadMs, 0);
    const layerSummary = t.layers
      .map((l) => {
        const mapMs = (mapLayerMs[l.layerName] ?? 0).toFixed(0);
        return `${l.layerType}: ${l.featureCount.toLocaleString()} feat | DB: ${l.loadMs.toFixed(0)} ms | Map: ${mapMs} ms`;
      })
      .join('<br>');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${run}</td><td>${areas.length}</td>
      <td>${t.osmElementCount.toLocaleString()}</td>
      <td>${t.osmDataProcessingMs.toFixed(0)}</td>
      <td>${t.boundariesProcessingMs.toFixed(0)}</td>
      <td>${dbTotalMs.toFixed(0)}</td>
      <td>${mapTotalMs.toFixed(0)}</td>
      <td>${(dbTotalMs + mapTotalMs).toFixed(0)}</td>
      <td class="layer-cell">${layerSummary}</td>`;
    this.tableBody.appendChild(tr);
  }

  private appendErrorRow(run: number, message: string) {
    const tr = document.createElement('tr');
    tr.className = 'error-row';
    tr.innerHTML = `<td>${run}</td><td colspan="6">ERROR: ${message}</td>`;
    this.tableBody.appendChild(tr);
  }

  downloadCsv() {
    [
      ['benchmark-runs.csv', buildRunsCsv(this.runResults)],
      ['benchmark-layers.csv', buildLayersCsv(this.layerResults)],
    ].forEach(([name, content]) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([content], { type: 'text/csv' }));
      a.download = name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    });
  }

  loadFromData(runs: RunResult[], layers: LayerResult[]) {
    this.runResults = runs;
    this.layerResults = layers;
    runs.forEach((r) => {
      const t = layers.filter((l) => l.run === r.run);
      const fakeTimings: OsmLoadTimings = {
        osmElementCount: r.osmElementCount,
        boundaryElementCount: r.boundaryElementCount,
        osmDataProcessingMs: r.osmDataProcessingMs,
        boundariesProcessingMs: r.boundariesProcessingMs,
        layers: t.map((l) => ({ layerName: l.layerName, layerType: l.layerType, loadMs: l.loadMs, featureCount: l.featureCount })),
      };
      const mapLayerMs = Object.fromEntries(t.map((l) => [l.layerName, l.mapLoadMs]));
      this.renderTableRow(r.run, r.neighborhoods.split('; '), fakeTimings, r.mapTotalMs, mapLayerMs);
    });
    this.setProgress(runs.length, NEIGHBORHOODS.length);
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
    benchmark.loadFromData(existing.runs, existing.layers);
    renderCharts(existing.runs, existing.layers);
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
