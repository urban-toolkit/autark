import type { FeatureCollection } from 'geojson';
import { SpatialDb } from 'autk-db';
import { Scatterplot, Barchart, ParallelCoordinates, Histogram, PlotEvent } from 'autk-plot';
import { AutkMap } from 'autk-map';
import {
  createAutarkProvenance,
  renderProvenanceTrailUI,
  computeGraphMetrics,
  computeSelectionFrequency,
  getInsightAnnotations,
  generateSessionNarrative,
  PlotType,
  type StrategyLabel,
  type CustomControlConfig,
} from 'autk-provenance';

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

// Add a compactness metric (how circular the polygon is; 1 = perfect circle)
// to every feature so Parallel Coordinates has a meaningful third axis.
function enrichFeatures(geojson: FeatureCollection): void {
  for (const f of geojson.features) {
    const area  = f.properties?.shape_area as number ?? 0;
    const perim = f.properties?.shape_leng as number ?? 1;
    if (f.properties) {
      f.properties.compactness = Math.round((4 * Math.PI * area / (perim * perim)) * 1000) / 1000;
    }
  }
}

// Bar chart: one row per community district (cdta2020), height = neighborhood count.
// Indices here (0–N) don't align 1:1 with the 38-feature map dataset — that's expected.
// The bar chart's provenance tracking is correct; map cross-highlight uses the district
// count index as a fallback, which is an acceptable approximation for this demo.
function buildDistrictData(geojson: FeatureCollection): FeatureCollection {
  const groups = new Map<string, { count: number; totalArea: number }>();
  for (const f of geojson.features) {
    const cd   = f.properties?.cdta2020 as string ?? 'Unknown';
    const area = f.properties?.shape_area as number ?? 0;
    const g    = groups.get(cd) ?? { count: 0, totalArea: 0 };
    g.count++;
    g.totalArea += area;
    groups.set(cd, g);
  }
  return {
    type: 'FeatureCollection',
    features: [...groups.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([cdta2020, { count, totalArea }]) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [0, 0] },
        properties: {
          cdta2020,
          count,
          avg_area_km2: Math.round(totalArea / count / 1e6 * 100) / 100,
        },
      })),
  };
}

// ---------------------------------------------------------------------------
// Session insight card renderers
// ---------------------------------------------------------------------------

type ProvenanceApi = ReturnType<typeof createAutarkProvenance>;

const STRATEGY_COLORS: Record<StrategyLabel, string> = {
  Confirmatory:          '#2e7d32',
  Exploratory:           '#1565c0',
  'Iterative Refinement': '#6a1b9a',
};

const STRATEGY_DESC: Record<StrategyLabel, string> = {
  Confirmatory:          'Focused, linear exploration — you appear to know what you are looking for.',
  Exploratory:           'Broad, open-ended investigation with multiple diverging paths.',
  'Iterative Refinement': 'Hypothesis-driven: repeated backtracking and revision of prior selections.',
};

let _annotationNodeId: string | null = null;
let _annotationTextarea: HTMLTextAreaElement | null = null;

function renderMetricsCard(el: HTMLElement, provenance: ProvenanceApi): void {
  const m = computeGraphMetrics(provenance.getGraph());
  el.innerHTML = '';

  const badge = document.createElement('span');
  badge.className = 'strategy-badge';
  badge.textContent = m.strategyLabel;
  badge.style.background = STRATEGY_COLORS[m.strategyLabel];
  el.appendChild(badge);

  const desc = document.createElement('p');
  desc.className = 'strategy-desc';
  desc.textContent = STRATEGY_DESC[m.strategyLabel];
  el.appendChild(desc);

  const row = document.createElement('div');
  row.className = 'metrics-row';
  const chips: [string, string | number][] = [
    ['States', m.totalNodes], ['Branches', m.branchPoints],
    ['Backtracks', m.backtracks], ['Insights', m.insightCount],
  ];
  if (m.sessionDurationMs > 0) {
    const s = Math.round(m.sessionDurationMs / 1000);
    chips.unshift(['Duration', s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`]);
  }
  for (const [label, val] of chips) {
    const chip = document.createElement('span');
    chip.className = 'metric-chip';
    chip.innerHTML = `<strong>${val}</strong> ${label}`;
    row.appendChild(chip);
  }
  el.appendChild(row);
}

function renderAnnotateCard(el: HTMLElement, provenance: ProvenanceApi): void {
  const current = provenance.getCurrentNode();
  if (!current) {
    el.innerHTML = '<span class="insights-loading">No active node.</span>';
    _annotationNodeId = null; _annotationTextarea = null;
    return;
  }
  if (current.id === _annotationNodeId && _annotationTextarea) {
    if (!_annotationTextarea.matches(':focus')) {
      const ex = current.metadata?.insight;
      _annotationTextarea.value = typeof ex === 'string' ? ex : '';
    }
    return;
  }
  _annotationNodeId = current.id;
  el.innerHTML = '';

  const lbl = document.createElement('div');
  lbl.className = 'annotation-label';
  lbl.textContent = `Step: ${current.actionLabel}`;
  el.appendChild(lbl);

  const ta = document.createElement('textarea');
  ta.className = 'annotation-textarea';
  ta.placeholder = 'What did you notice or conclude at this step?';
  const ex = current.metadata?.insight;
  ta.value = typeof ex === 'string' ? ex : '';
  el.appendChild(ta);
  _annotationTextarea = ta;

  const btn = document.createElement('button');
  btn.className = 'annotation-save-btn';
  btn.textContent = 'Save Insight';
  btn.addEventListener('click', () => {
    provenance.annotateNode(current.id, ta.value.trim());
    btn.textContent = 'Saved ✓';
    setTimeout(() => { btn.textContent = 'Save Insight'; }, 1500);
  });
  el.appendChild(btn);
}

function renderFreqCard(
  el: HTMLElement, provenance: ProvenanceApi, featureName: (id: number) => string,
): void {
  const freq = computeSelectionFrequency(provenance.getGraph());
  el.innerHTML = '';

  const topMap   = [...freq.map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const topPlots = [...freq.plots.entries()].map(([plotId, m]) => ({
    plotId, top: [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
  })).filter(p => p.top.length > 0);

  if (!topMap.length && !topPlots.length) {
    const s = document.createElement('span');
    s.className = 'freq-empty';
    s.textContent = 'No selections yet. Click a neighborhood on the map or interact with any chart.';
    el.appendChild(s); return;
  }

  const maxCount = Math.max(...topMap.map(([,c])=>c), ...topPlots.flatMap(p=>p.top.map(([,c])=>c)), 1);

  const renderGroup = (label: string, items: [number, number][]): void => {
    if (!items.length) return;
    const gl = document.createElement('div');
    gl.className = 'freq-group-label';
    gl.textContent = label;
    el.appendChild(gl);

    for (const [id, count] of items) {
      const row = document.createElement('div'); row.className = 'freq-row';
      const nm = document.createElement('span'); nm.className = 'freq-id';
      nm.textContent = featureName(id); nm.title = `Feature index #${id}`; row.appendChild(nm);
      const wrap = document.createElement('div'); wrap.className = 'freq-bar-wrap';
      const fill = document.createElement('div'); fill.className = 'freq-bar-fill';
      fill.style.width = `${Math.round((count / maxCount) * 100)}%`; wrap.appendChild(fill); row.appendChild(wrap);
      const cnt = document.createElement('span'); cnt.className = 'freq-count';
      cnt.textContent = `${count}×`; row.appendChild(cnt);
      el.appendChild(row);
    }
  };

  renderGroup('Map', topMap);
  for (const { plotId, top } of topPlots) renderGroup(plotId, top);
}

function renderSummaryCard(el: HTMLElement, provenance: ProvenanceApi): void {
  const graph = provenance.getGraph();
  const narrative = generateSessionNarrative(graph, computeGraphMetrics(graph), getInsightAnnotations(graph));
  el.innerHTML = '';
  const pre = document.createElement('pre'); pre.className = 'summary-pre'; pre.textContent = narrative;
  el.appendChild(pre);
  const btn = document.createElement('button'); btn.className = 'copy-btn'; btn.textContent = 'Copy to clipboard';
  btn.addEventListener('click', () => navigator.clipboard.writeText(narrative).then(() => {
    btn.textContent = 'Copied ✓'; setTimeout(() => { btn.textContent = 'Copy to clipboard'; }, 1800);
  }));
  el.appendChild(btn);
}

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------

function setupTabs(provenance: ProvenanceApi): void {
  const chartsTab      = document.getElementById('chartsTab')!;
  const provTab        = document.getElementById('provenanceTab')!;
  const provInsights   = document.getElementById('provTrailInsights')!;
  const badge          = document.getElementById('nodeCountBadge')!;

  document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab as 'charts' | 'provenance';
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      chartsTab.classList.toggle('hidden',   tab !== 'charts');
      provTab.classList.toggle('hidden',     tab !== 'provenance');
      provInsights.classList.toggle('hidden', tab !== 'provenance');
    });
  });

  provenance.addObserver(() => {
    const n = provenance.getGraph().nodes.size;
    badge.textContent = `${n} step${n !== 1 ? 's' : ''} recorded`;
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Loading overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(238,243,248,.92);display:flex;align-items:center;justify-content:center;font-size:15px;color:#1b3148;z-index:9999;font-family:system-ui,sans-serif;';
  overlay.textContent = 'Loading Manhattan neighborhood data…';
  document.body.appendChild(overlay);

  // Load real Manhattan data via SpatialDb (handles Mercator projection automatically)
  const db = new SpatialDb();
  await db.init();
  await db.loadCustomLayer({
    geojsonFileUrl: '/data/mnt_neighs_proj.geojson',
    outputTableName: 'neighborhoods',
  });
  const geojson = await db.getLayer('neighborhoods') as FeatureCollection;

  enrichFeatures(geojson);

  overlay.remove();

  const featureName = (id: number): string =>
    (geojson.features[id]?.properties?.ntaname as string | undefined) ?? `#${id}`;

  // ── Map ──────────────────────────────────────────────────────────────────
  const canvas = document.querySelector('canvas') as HTMLCanvasElement;
  const map    = new AutkMap(canvas);
  await map.init();
  map.loadGeoJsonLayer('neighborhoods', geojson);
  map.updateRenderInfoProperty('neighborhoods', 'isPick', true);
  map.draw();

  // ── Plots ─────────────────────────────────────────────────────────────────
  const districtData = buildDistrictData(geojson);

  function plotDims(el: HTMLElement, fw: number, fh: number) {
    const r = el.getBoundingClientRect();
    return { width: r.width > 20 ? Math.floor(r.width) : fw, height: r.height > 20 ? Math.floor(r.height) : fh };
  }

  const scatterEl = document.getElementById('scatterBody')!;
  const barEl     = document.getElementById('barBody')!;
  const pcEl      = document.getElementById('pcBody')!;
  const histEl    = document.getElementById('histBody')!;

  const sd = plotDims(scatterEl, 340, 260);
  const bd = plotDims(barEl, 340, 260);
  const pd = plotDims(pcEl, 340, 260);
  const hd = plotDims(histEl, 340, 260);

  const scatter = new Scatterplot({
    div: scatterEl, data: geojson,
    labels: { axis: ['shape_area', 'shape_leng'], title: 'Area vs Perimeter' },
    width: sd.width, height: sd.height,
    margins: { left: 62, right: 16, top: 36, bottom: 48 },
    events: [PlotEvent.BRUSH],
  });

  const bar = new Barchart({
    div: barEl, data: districtData,
    labels: { axis: ['cdta2020', 'count'], title: 'Neighborhoods per District' },
    width: bd.width, height: bd.height,
    margins: { left: 50, right: 16, top: 36, bottom: 68 },
    events: [PlotEvent.CLICK],
  });

  const pc = new ParallelCoordinates({
    div: pcEl, data: geojson,
    labels: { axis: ['shape_area', 'shape_leng', 'compactness'], title: 'Neighborhood Metrics' },
    width: pd.width, height: pd.height,
    margins: { left: 28, right: 28, top: 36, bottom: 36 },
    events: [PlotEvent.BRUSH_Y],
  });

  const hist = new Histogram({
    div: histEl, data: geojson,
    labels: { axis: ['shape_area', 'Count'], title: 'Area Distribution' },
    width: hd.width, height: hd.height,
    margins: { left: 55, right: 16, top: 36, bottom: 48 },
    events: [PlotEvent.CLICK, PlotEvent.BRUSH_X],
  });

  // ── Thematic dropdown (custom control tracked by provenance) ──────────────
  function applyThematic(prop: string): void {
    if (prop) {
      map.updateGeoJsonLayerThematic(
        'neighborhoods', geojson,
        (f) => +(f.properties?.[prop] ?? 0)
      );
      map.updateRenderInfoProperty('neighborhoods', 'isColorMap', true);
    } else {
      map.updateRenderInfoProperty('neighborhoods', 'isColorMap', false);
    }
  }

  const thematicControl: CustomControlConfig = {
    selector: '#thematicSelect',
    event: 'change',
    actionType: 'MAP_THEMATIC_PROPERTY',
    getLabel: (el) => {
      const v = (el as HTMLSelectElement).value;
      return v ? `Color by: ${v}` : 'Thematic off';
    },
    getStateDelta: (el) => {
      const v = (el as HTMLSelectElement).value;
      return { filters: { thematicProperty: v || null }, ui: { thematicEnabled: !!v } };
    },
    applyState: (el, state) => {
      const prop = (state.filters?.thematicProperty as string) || '';
      (el as HTMLSelectElement).value = prop;
      applyThematic(prop);
    },
  };

  // ── Provenance ────────────────────────────────────────────────────────────
  const scatterProv = Object.assign(scatter, { plotId: 'Scatterplot',         plotType: PlotType.SCATTERPLOT });
  const barProv     = Object.assign(bar,     { plotId: 'Bar Chart',            plotType: PlotType.BARCHART });
  const pcProv      = Object.assign(pc,      { plotId: 'Parallel Coordinates', plotType: PlotType.PARALLEL_COORDINATES });
  const histProv    = Object.assign(hist,    { plotId: 'Histogram',            plotType: PlotType.HISTOGRAM });

  const provenance = createAutarkProvenance({
    map,
    plots: [scatterProv, barProv, pcProv, histProv],
    db,
    mapConfig: { customControls: [thematicControl] },
  });

  // ── Provenance trail UI ───────────────────────────────────────────────────
  renderProvenanceTrailUI({
    provenance, container: document.getElementById('provenanceTrail')!,
    insightsContainer: document.getElementById('provTrailInsights')!,
    showTimestamps: true, showGraph: true, showPathList: true, showBackForward: true,
  });

  setupTabs(provenance);

  // ── Session insight cards ─────────────────────────────────────────────────
  const annotateEl = document.querySelector('#insightsAnnotate .insights-card-body') as HTMLElement;
  const summaryEl  = document.querySelector('#insightsSummary  .insights-card-body') as HTMLElement;

  function refreshInsights(): void {
    renderAnnotateCard(annotateEl, provenance);
    renderSummaryCard(summaryEl,  provenance);
  }
  provenance.addObserver(refreshInsights);
  refreshInsights();

  // ── Export / Import ───────────────────────────────────────────────────────
  document.getElementById('exportBtn')!.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([provenance.exportGraph()], { type: 'application/json' }));
    Object.assign(document.createElement('a'), { href: url, download: `provenance-${Date.now()}.json` }).click();
    URL.revokeObjectURL(url);
  });
  document.getElementById('importBtn')!.addEventListener('click', () =>
    (document.getElementById('importFile') as HTMLInputElement).click()
  );
  (document.getElementById('importFile') as HTMLInputElement).addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { if (typeof ev.target?.result === 'string') provenance.importGraph(ev.target.result); };
    reader.readAsText(file);
  });
}

main();
