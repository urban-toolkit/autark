import { AutkSpatialDb } from 'autk-db';
import type { OsmLoadTimings } from 'autk-db';
import { AutkMap } from 'autk-map';
import * as d3 from 'd3';

// ── Configuration ─────────────────────────────────────────────────────────────

const NUM_REPETITIONS = 10;
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
  repetition: number;
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
  repetition: number;
  neighborhoodCount: number;
  layerName: string;
  layerType: string;
  loadMs: number;
  featureCount: number;
  mapLoadMs: number;
}

interface RunStats {
  neighborhoodCount: number;
  dbTotalMean: number;
  dbTotalStd: number;
  mapTotalMean: number;
  mapTotalStd: number;
}

interface LayerStats {
  neighborhoodCount: number;
  layerType: string;
  loadMsMean: number;
  loadMsStd: number;
  featureCountMean: number;
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

function computeRunStats(runs: RunResult[]): RunStats[] {
  const counts = [...new Set(runs.map((r) => r.neighborhoodCount))].sort((a, b) => a - b);
  return counts.map((nc) => {
    const group = runs.filter((r) => r.neighborhoodCount === nc);
    const dbs = group.map((r) => r.dbTotalMs);
    const maps = group.map((r) => r.mapTotalMs);
    return {
      neighborhoodCount: nc,
      dbTotalMean: mean(dbs),
      dbTotalStd: stddev(dbs),
      mapTotalMean: mean(maps),
      mapTotalStd: stddev(maps),
    };
  });
}

function computeLayerStats(layers: LayerResult[]): LayerStats[] {
  const counts = [...new Set(layers.map((l) => l.neighborhoodCount))].sort((a, b) => a - b);
  const types = [...new Set(layers.map((l) => l.layerType))];
  const result: LayerStats[] = [];
  for (const nc of counts) {
    for (const lt of types) {
      const group = layers.filter((l) => l.neighborhoodCount === nc && l.layerType === lt);
      if (group.length === 0) continue;
      const loadTimes = group.map((l) => l.loadMs);
      result.push({
        neighborhoodCount: nc,
        layerType: lt,
        loadMsMean: mean(loadTimes),
        loadMsStd: stddev(loadTimes),
        featureCountMean: mean(group.map((l) => l.featureCount)),
      });
    }
  }
  return result;
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

const LAYER_TYPE_MAP: Record<string, string> = {
  surface:   'surface',
  parks:     'parks',
  water:     'water',
  roads:     'roads',
  buildings: 'buildings',
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

function addStdBand<T>(
  g: d3.Selection<SVGGElement, unknown, HTMLElement, unknown>,
  data: T[],
  x: d3.ScaleLinear<number, number>,
  y: d3.ScaleLinear<number, number>,
  xVal: (d: T) => number,
  meanVal: (d: T) => number,
  stdVal: (d: T) => number,
  clr: string,
) {
  if (data.length < 2) return;
  g.append('path')
    .datum(data)
    .attr('fill', clr)
    .attr('fill-opacity', 0.15)
    .attr('stroke', 'none')
    .attr('d', d3.area<T>()
      .x((d) => x(xVal(d)))
      .y0((d) => y(Math.max(0, meanVal(d) - stdVal(d))))
      .y1((d) => y(meanVal(d) + stdVal(d)))
      .curve(d3.curveLinear));
}

// ── Chart 1 – DB/Map time (mean ± 1σ) + per-layer means vs. neighborhood count

function chartTime(runs: RunResult[], layers: LayerResult[]) {
  if (runs.length === 0) return;
  const { g, w, h } = makeSvg('chart-time');

  const runStats = computeRunStats(runs);
  const layerStats = computeLayerStats(layers);
  const layerTypes = [...new Set(layerStats.map((l) => l.layerType))];

  const x = d3.scaleLinear()
    .domain([1, d3.max(runStats, (d) => d.neighborhoodCount)!])
    .range([0, w]);

  const allTimes = [
    ...runStats.map((r) => r.dbTotalMean + r.dbTotalStd),
    ...runStats.map((r) => r.mapTotalMean + r.mapTotalStd),
    ...layerStats.map((l) => l.loadMsMean),
  ];
  const y = d3.scaleLinear().domain([0, d3.max(allTimes)! * 1.15]).range([h, 0]);

  addHGrid(g, y, w);

  const xAxisSel = g.append('g').attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(x).ticks(runs.length).tickFormat(d3.format('d')));
  const yAxisSel = g.append('g')
    .call(d3.axisLeft(y).ticks(5).tickFormat((v) => `${v} ms`));
  applyAxisStyle(xAxisSel); applyAxisStyle(yAxisSel);

  // DB total: ±1σ band + mean line
  addStdBand(g, runStats, x, y,
    (d) => d.neighborhoodCount, (d) => d.dbTotalMean, (d) => d.dbTotalStd,
    color('total'));

  g.append('path')
    .datum(runStats)
    .attr('fill', 'none').attr('stroke', color('total')).attr('stroke-width', 2)
    .attr('d', d3.line<RunStats>()
      .x((d) => x(d.neighborhoodCount)).y((d) => y(d.dbTotalMean)).curve(d3.curveLinear));

  g.selectAll<SVGCircleElement, RunStats>('circle.c-total')
    .data(runStats).join('circle').attr('class', 'c-total')
    .attr('cx', (d) => x(d.neighborhoodCount)).attr('cy', (d) => y(d.dbTotalMean))
    .attr('r', 3.5).attr('fill', color('total'));

  // Map total: ±1σ band + mean line (dashed)
  addStdBand(g, runStats, x, y,
    (d) => d.neighborhoodCount, (d) => d.mapTotalMean, (d) => d.mapTotalStd,
    color('map'));

  g.append('path')
    .datum(runStats)
    .attr('fill', 'none').attr('stroke', color('map')).attr('stroke-width', 2)
    .attr('stroke-dasharray', '5,3')
    .attr('d', d3.line<RunStats>()
      .x((d) => x(d.neighborhoodCount)).y((d) => y(d.mapTotalMean)).curve(d3.curveLinear));

  g.selectAll<SVGCircleElement, RunStats>('circle.c-map')
    .data(runStats).join('circle').attr('class', 'c-map')
    .attr('cx', (d) => x(d.neighborhoodCount)).attr('cy', (d) => y(d.mapTotalMean))
    .attr('r', 3.5).attr('fill', color('map'));

  // Per-layer mean lines (no bands to keep chart readable)
  for (const lt of layerTypes) {
    const data = layerStats.filter((l) => l.layerType === lt);

    g.append('path')
      .datum(data)
      .attr('fill', 'none').attr('stroke', color(lt)).attr('stroke-width', 1.5)
      .attr('d', d3.line<LayerStats>()
        .x((d) => x(d.neighborhoodCount)).y((d) => y(d.loadMsMean)).curve(d3.curveLinear));

    g.selectAll<SVGCircleElement, LayerStats>(`circle.c-${lt}`)
      .data(data).join('circle').attr('class', `c-${lt}`)
      .attr('cx', (d) => x(d.neighborhoodCount)).attr('cy', (d) => y(d.loadMsMean))
      .attr('r', 3).attr('fill', color(lt));
  }

  const legendEntries = [
    { key: 'total', label: `DB Total (mean ± 1σ, n=${NUM_REPETITIONS})` },
    { key: 'map',   label: `Map Total (mean ± 1σ, n=${NUM_REPETITIONS})` },
    ...layerTypes.map((lt) => ({ key: lt, label: `${lt} (mean)` })),
  ];
  addLineLegend(g, legendEntries, 20, 0);
  addAxisLabels(g, w, h, 'Neighborhoods loaded', 'Processing time (ms)');
  addTitle(g, w, 'DB processing time vs. neighborhoods');
}

// ── Chart 2 – Feature count per layer vs. neighborhood count ──────────────────

function chartFeatures(layers: LayerResult[]) {
  if (layers.length === 0) return;
  const { g, w, h } = makeSvg('chart-features');

  const layerStats = computeLayerStats(layers);
  const layerTypes = [...new Set(layerStats.map((l) => l.layerType))];
  const maxN = d3.max(layerStats, (d) => d.neighborhoodCount)!;

  const countsByNc = [...new Set(layerStats.map((l) => l.neighborhoodCount))].sort((a, b) => a - b);
  const totalData = countsByNc.map((nc) => ({
    neighborhoodCount: nc,
    featureCount: d3.sum(layerStats.filter((l) => l.neighborhoodCount === nc), (l) => l.featureCountMean),
  }));

  const maxF = d3.max(totalData, (d) => d.featureCount)!;

  const x = d3.scaleLinear().domain([1, maxN]).range([0, w]);
  const y = d3.scaleLinear().domain([0, maxF * 1.15]).range([h, 0]);

  addHGrid(g, y, w);

  const xAxisSel = g.append('g').attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(x).ticks(maxN).tickFormat(d3.format('d')));
  const yAxisSel = g.append('g').call(d3.axisLeft(y).ticks(5));
  applyAxisStyle(xAxisSel); applyAxisStyle(yAxisSel);

  for (const lt of layerTypes) {
    const data = layerStats.filter((l) => l.layerType === lt);

    g.append('path').datum(data)
      .attr('fill', 'none').attr('stroke', color(lt)).attr('stroke-width', 1.5)
      .attr('d', d3.line<LayerStats>()
        .x((d) => x(d.neighborhoodCount)).y((d) => y(d.featureCountMean)).curve(d3.curveLinear));

    g.selectAll<SVGCircleElement, LayerStats>(`circle.c-${lt}`)
      .data(data).join('circle').attr('class', `c-${lt}`)
      .attr('cx', (d) => x(d.neighborhoodCount)).attr('cy', (d) => y(d.featureCountMean))
      .attr('r', 3).attr('fill', color(lt));
  }

  // Total line
  g.append('path').datum(totalData)
    .attr('fill', 'none').attr('stroke', color('total')).attr('stroke-width', 2)
    .attr('d', d3.line<{ neighborhoodCount: number; featureCount: number }>()
      .x((d) => x(d.neighborhoodCount)).y((d) => y(d.featureCount)).curve(d3.curveLinear));

  g.selectAll<SVGCircleElement, { neighborhoodCount: number; featureCount: number }>('circle.c-total')
    .data(totalData).join('circle').attr('class', 'c-total')
    .attr('cx', (d) => x(d.neighborhoodCount)).attr('cy', (d) => y(d.featureCount))
    .attr('r', 3.5).attr('fill', color('total'));

  const legendEntries = [
    { key: 'total', label: `Total (mean, n=${NUM_REPETITIONS})` },
    ...layerTypes.map((lt) => ({ key: lt, label: lt })),
  ];
  addLineLegend(g, legendEntries, 20, 0);
  addAxisLabels(g, w, h, 'Neighborhoods loaded', 'Feature count');
  addTitle(g, w, 'Feature count vs. neighborhoods');
}

// ── Chart 3 – Loading time (mean ± 1σ) vs. feature count ─────────────────────

function chartScatter(runs: RunResult[], layers: LayerResult[]) {
  if (runs.length === 0) return;
  const { g, w, h } = makeSvg('chart-scatter');

  const runStats = computeRunStats(runs);
  const layerStats = computeLayerStats(layers);

  const data = runStats.map((rs) => {
    const featureCount = d3.sum(
      layerStats.filter((l) => l.neighborhoodCount === rs.neighborhoodCount),
      (l) => l.featureCountMean,
    );
    return {
      featureCount,
      dbMean: rs.dbTotalMean,
      dbStd: rs.dbTotalStd,
      mapMean: rs.mapTotalMean,
      mapStd: rs.mapTotalStd,
      totalMean: rs.dbTotalMean + rs.mapTotalMean,
      totalStd: Math.sqrt(rs.dbTotalStd ** 2 + rs.mapTotalStd ** 2),
    };
  });

  type DataPoint = typeof data[0];

  const x = d3.scaleLinear().domain([0, d3.max(data, (d) => d.featureCount)! * 1.1]).range([0, w]);
  const y = d3.scaleLinear().domain([0, d3.max(data, (d) => d.totalMean + d.totalStd)! * 1.1]).range([h, 0]);

  addHGrid(g, y, w);

  const xAxisSel = g.append('g').attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(x).ticks(5));
  const yAxisSel = g.append('g')
    .call(d3.axisLeft(y).ticks(5).tickFormat((v) => `${+v / 1000}s`));
  applyAxisStyle(xAxisSel); applyAxisStyle(yAxisSel);

  const series: {
    key: string; label: string;
    meanVal: (d: DataPoint) => number; stdVal: (d: DataPoint) => number;
    dash?: string; width: number;
  }[] = [
    { key: 'total', label: `Total (mean ± 1σ, n=${NUM_REPETITIONS})`,    meanVal: (d) => d.totalMean, stdVal: (d) => d.totalStd, width: 2 },
    { key: 'map',   label: `3D Map (mean ± 1σ, n=${NUM_REPETITIONS})`,   meanVal: (d) => d.mapMean,   stdVal: (d) => d.mapStd,   width: 1.5, dash: '5,3' },
    { key: 'db',    label: `Database (mean ± 1σ, n=${NUM_REPETITIONS})`, meanVal: (d) => d.dbMean,    stdVal: (d) => d.dbStd,    width: 1.5, dash: '2,3' },
  ];

  series.forEach(({ key, meanVal, stdVal, dash, width }) => {
    // ±1σ band
    g.append('path')
      .datum(data)
      .attr('fill', color(key)).attr('fill-opacity', 0.15).attr('stroke', 'none')
      .attr('d', d3.area<DataPoint>()
        .x((d) => x(d.featureCount))
        .y0((d) => y(Math.max(0, meanVal(d) - stdVal(d))))
        .y1((d) => y(meanVal(d) + stdVal(d)))
        .curve(d3.curveLinear));

    // Mean line
    g.append('path')
      .attr('fill', 'none').attr('stroke', color(key))
      .attr('stroke-width', width).attr('stroke-dasharray', dash ?? null)
      .attr('d', d3.line<DataPoint>()
        .x((d) => x(d.featureCount)).y((d) => y(meanVal(d))).curve(d3.curveLinear)(data));

    g.selectAll<SVGCircleElement, DataPoint>(`circle.cs-${key}`)
      .data(data).join('circle').attr('class', `cs-${key}`)
      .attr('cx', (d) => x(d.featureCount)).attr('cy', (d) => y(meanVal(d)))
      .attr('r', 3).attr('fill', color(key));
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
  const header = 'run,repetition,neighborhood_count,neighborhoods,osm_element_count,boundary_element_count,osm_processing_ms,boundaries_processing_ms,db_total_ms,map_init_ms,map_total_ms';
  const rows = results.map((r) =>
    [r.run, r.repetition, r.neighborhoodCount, `"${r.neighborhoods}"`, r.osmElementCount,
      r.boundaryElementCount, r.osmDataProcessingMs.toFixed(1),
      r.boundariesProcessingMs.toFixed(1), r.dbTotalMs.toFixed(1),
      r.mapInitMs.toFixed(1), r.mapTotalMs.toFixed(1)].join(','),
  );
  return [header, ...rows].join('\n');
}

function buildLayersCsv(results: LayerResult[]): string {
  const header = 'run,repetition,neighborhood_count,layer_name,layer_type,load_ms,feature_count,map_load_ms';
  const rows = results.map((l) =>
    [l.run, l.repetition, l.neighborhoodCount, l.layerName, l.layerType,
      l.loadMs.toFixed(1), l.featureCount, l.mapLoadMs.toFixed(1)].join(','),
  );
  return [header, ...rows].join('\n');
}

function parseRunsCsv(text: string): RunResult[] {
  const lines = text.trim().split('\n').slice(1);
  return lines.map((line) => {
    const match = line.match(/^(\d+),(\d+),(\d+),"([^"]*)",(\d+),(\d+),([\d.]+),([\d.]+),([\d.]+)(?:,([\d.]+),([\d.]+))?$/);
    if (!match) return null;
    return {
      run: +match[1], repetition: +match[2], neighborhoodCount: +match[3], neighborhoods: match[4],
      osmElementCount: +match[5], boundaryElementCount: +match[6],
      osmDataProcessingMs: +match[7], boundariesProcessingMs: +match[8], dbTotalMs: +match[9],
      mapInitMs: +(match[10] ?? 0), mapTotalMs: +(match[11] ?? 0),
    } as RunResult;
  }).filter((r): r is RunResult => r !== null);
}

function parseLayersCsv(text: string): LayerResult[] {
  const lines = text.trim().split('\n').slice(1);
  return lines.map((line) => {
    const [run, repetition, neighborhoodCount, layerName, layerType, loadMs, featureCount, mapLoadMs] = line.split(',');
    return {
      run: +run, repetition: +(repetition ?? 1), neighborhoodCount: +neighborhoodCount,
      layerName, layerType, loadMs: +loadMs, featureCount: +featureCount,
      mapLoadMs: +(mapLoadMs ?? 0),
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

    const totalSteps = NEIGHBORHOODS.length * NUM_REPETITIONS;

    for (let n = 1; n <= NEIGHBORHOODS.length; n++) {
      const areas = NEIGHBORHOODS.slice(0, n);

      for (let rep = 1; rep <= NUM_REPETITIONS; rep++) {
        const stepsDone = (n - 1) * NUM_REPETITIONS + rep - 1;
        if (stepsDone > 0) await this.countdown(INTER_RUN_COOLDOWN_S, n, rep);

        this.setStatus(`Run ${n} / ${NEIGHBORHOODS.length}, rep ${rep} / ${NUM_REPETITIONS} — loading ${n} neighborhood(s): ${areas.join(', ')}`);
        this.setProgress(stepsDone, totalSteps);

        try {
          const { timings, db } = await this.execRun(n, areas);
          const { mapInitMs, mapLayerMs } = await this.execMapRun(db, timings);
          this.recordRun(n, rep, areas, timings, mapInitMs, mapLayerMs);
          this.renderRepRow(n, rep, areas, timings, mapInitMs + Object.values(mapLayerMs).reduce((s, v) => s + v, 0), mapLayerMs);
          renderCharts(this.runResults, this.layerResults);
        } catch (err) {
          console.error(`Run ${n} rep ${rep} failed:`, err);
          this.appendErrorRow(n, rep, String(err));
        }
      }

      // Stats summary row after all reps for this neighborhood count
      const repsForN = this.runResults.filter((r) => r.neighborhoodCount === n);
      if (repsForN.length > 0) {
        this.renderStatsRow(n, repsForN);
      }

      this.setProgress(n * NUM_REPETITIONS, totalSteps);
    }

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

  private async countdown(seconds: number, nextRun: number, nextRep: number) {
    for (let s = seconds; s > 0; s--) {
      this.setStatus(`Cooldown before run ${nextRun} rep ${nextRep} — waiting ${s} s to avoid Overpass API rate limits…`);
      await new Promise<void>((r) => setTimeout(r, 1_000));
    }
  }

  private async execRun(runIndex: number, areas: string[]): Promise<{ timings: OsmLoadTimings; db: AutkSpatialDb }> {
    const db = new AutkSpatialDb();
    await db.init();
    const timings = await db.loadOsm({
      queryArea: { geocodeArea: GEOCODE_AREA, areas },
      outputTableName: `table_osm_run${runIndex}`,
      autoLoadLayers: { coordinateFormat: COORDINATE_FORMAT, layers: [...LAYERS], dropOsmTable: true },
    });
    return { timings, db };
  }

  private async execMapRun(db: AutkSpatialDb, timings: OsmLoadTimings): Promise<{ mapInitMs: number; mapLayerMs: Record<string, number> }> {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    canvas.style.position = 'fixed';
    canvas.style.top = '-9999px';
    canvas.style.left = '-9999px';
    canvas.style.visibility = 'hidden';
    document.body.appendChild(canvas);
    try {
      const map = new AutkMap(canvas);
      const t0 = performance.now();
      await map.init();
      const mapInitMs = performance.now() - t0;

      const mapLayerMs: Record<string, number> = {};
      for (const layer of timings.layers) {
        const t1 = performance.now();
        const geojson = await db.getLayer(layer.layerName);
        map.loadCollection({ id: layer.layerName, collection: geojson, type: (LAYER_TYPE_MAP[layer.layerType] ?? null) as any });
        mapLayerMs[layer.layerName] = performance.now() - t1;
      }

      return { mapInitMs, mapLayerMs };
    } finally {
      document.body.removeChild(canvas);
    }
  }

  private recordRun(run: number, repetition: number, areas: string[], t: OsmLoadTimings, mapInitMs: number, mapLayerMs: Record<string, number>) {
    const dbTotalMs = t.osmDataProcessingMs + t.boundariesProcessingMs + t.layers.reduce((s, l) => s + l.loadMs, 0);
    const mapTotalMs = mapInitMs + Object.values(mapLayerMs).reduce((s, v) => s + v, 0);
    this.runResults.push({
      run, repetition, neighborhoodCount: areas.length, neighborhoods: areas.join('; '),
      osmElementCount: t.osmElementCount, boundaryElementCount: t.boundaryElementCount,
      osmDataProcessingMs: t.osmDataProcessingMs, boundariesProcessingMs: t.boundariesProcessingMs, dbTotalMs,
      mapInitMs, mapTotalMs,
    });
    for (const layer of t.layers) {
      this.layerResults.push({
        run, repetition, neighborhoodCount: areas.length, layerName: layer.layerName,
        layerType: layer.layerType, loadMs: layer.loadMs, featureCount: layer.featureCount,
        mapLoadMs: mapLayerMs[layer.layerName] ?? 0,
      });
    }
  }

  private renderRepRow(run: number, rep: number, areas: string[], t: OsmLoadTimings, mapTotalMs: number, mapLayerMs: Record<string, number>) {
    const dbTotalMs = t.osmDataProcessingMs + t.boundariesProcessingMs + t.layers.reduce((s, l) => s + l.loadMs, 0);
    const layerSummary = t.layers
      .map((l) => {
        const mapMs = (mapLayerMs[l.layerName] ?? 0).toFixed(0);
        return `${l.layerType}: ${l.featureCount.toLocaleString()} feat | DB: ${l.loadMs.toFixed(0)} ms | Map: ${mapMs} ms`;
      })
      .join('<br>');
    const tr = document.createElement('tr');
    tr.style.color = '#888';
    tr.innerHTML = `
      <td>${run}</td><td>${rep}</td><td>${areas.length}</td>
      <td>${t.osmElementCount.toLocaleString()}</td>
      <td>${t.osmDataProcessingMs.toFixed(0)}</td>
      <td>${t.boundariesProcessingMs.toFixed(0)}</td>
      <td>${dbTotalMs.toFixed(0)}</td>
      <td>${mapTotalMs.toFixed(0)}</td>
      <td>${(dbTotalMs + mapTotalMs).toFixed(0)}</td>
      <td class="layer-cell">${layerSummary}</td>`;
    this.tableBody.appendChild(tr);
  }

  private renderStatsRow(neighborhoodCount: number, reps: RunResult[]) {
    const dbTimes = reps.map((r) => r.dbTotalMs);
    const mapTimes = reps.map((r) => r.mapTotalMs);
    const totalTimes = reps.map((r) => r.dbTotalMs + r.mapTotalMs);
    const avgDb = mean(dbTimes); const sdDb = stddev(dbTimes);
    const avgMap = mean(mapTimes); const sdMap = stddev(mapTimes);
    const avgTotal = mean(totalTimes); const sdTotal = stddev(totalTimes);
    const avgOsm = mean(reps.map((r) => r.osmElementCount));
    const tr = document.createElement('tr');
    tr.style.fontWeight = 'bold';
    tr.style.backgroundColor = '#f0f4ff';
    tr.innerHTML = `
      <td>—</td><td>μ ± σ</td><td>${neighborhoodCount}</td>
      <td>${Math.round(avgOsm).toLocaleString()}</td>
      <td>—</td><td>—</td>
      <td>${avgDb.toFixed(0)} ± ${sdDb.toFixed(0)}</td>
      <td>${avgMap.toFixed(0)} ± ${sdMap.toFixed(0)}</td>
      <td>${avgTotal.toFixed(0)} ± ${sdTotal.toFixed(0)}</td>
      <td>—</td>`;
    this.tableBody.appendChild(tr);
  }

  private appendErrorRow(run: number, rep: number, message: string) {
    const tr = document.createElement('tr');
    tr.className = 'error-row';
    tr.innerHTML = `<td>${run}</td><td>${rep}</td><td colspan="7">ERROR: ${message}</td>`;
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

    const byNeighCount = new Map<number, RunResult[]>();
    for (const r of runs) {
      const arr = byNeighCount.get(r.neighborhoodCount) ?? [];
      arr.push(r);
      byNeighCount.set(r.neighborhoodCount, arr);
    }

    for (const [nc, reps] of [...byNeighCount.entries()].sort((a, b) => a[0] - b[0])) {
      for (const r of reps) {
        const t = layers.filter((l) => l.run === r.run && l.repetition === r.repetition);
        const fakeTimings: OsmLoadTimings = {
          osmElementCount: r.osmElementCount,
          boundaryElementCount: r.boundaryElementCount,
          osmDataProcessingMs: r.osmDataProcessingMs,
          boundariesProcessingMs: r.boundariesProcessingMs,
          layers: t.map((l) => ({ layerName: l.layerName, layerType: l.layerType, loadMs: l.loadMs, featureCount: l.featureCount })),
        };
        const mapLayerMs = Object.fromEntries(t.map((l) => [l.layerName, l.mapLoadMs]));
        this.renderRepRow(r.run, r.repetition, r.neighborhoods.split('; '), fakeTimings, r.mapTotalMs, mapLayerMs);
      }
      this.renderStatsRow(nc, reps);
    }

    const totalSteps = NEIGHBORHOODS.length * NUM_REPETITIONS;
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
