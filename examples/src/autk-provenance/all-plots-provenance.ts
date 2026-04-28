import type { FeatureCollection } from 'geojson';
import { SpatialDb } from 'autk-db';
import { Scatterplot, Barchart, ParallelCoordinates, Histogram, PlotEvent } from 'autk-plot';
import { AutkMap } from 'autk-map';
import {
  createAutarkProvenance,
  renderProvenanceTrailUI,
  computeGraphMetrics,
  getInsightAnnotations,
  generateSessionNarrative,
  PlotType,
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
  const groups = new Map<string, { count: number; totalArea: number; memberIds: number[] }>();
  geojson.features.forEach((f, index) => {
    const cd   = f.properties?.cdta2020 as string ?? 'Unknown';
    const area = f.properties?.shape_area as number ?? 0;
    const g    = groups.get(cd) ?? { count: 0, totalArea: 0, memberIds: [] };
    g.count++;
    g.totalArea += area;
    g.memberIds.push(index);
    groups.set(cd, g);
  });
  return {
    type: 'FeatureCollection',
    features: [...groups.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([cdta2020, { count, totalArea, memberIds }]) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [0, 0] },
        properties: {
          cdta2020,
          count,
          avg_area_km2: Math.round(totalArea / count / 1e6 * 100) / 100,
          memberIds,
        },
      })),
  };
}

// ---------------------------------------------------------------------------
// Session insight card renderers
// ---------------------------------------------------------------------------

type ProvenanceApi = ReturnType<typeof createAutarkProvenance>;
type ChartKey = 'scatter' | 'bar' | 'pc' | 'hist';
type InteractivePlot = {
  selection: number[];
  plotEvents: {
    addEventListener(event: string, listener: (selection: number[]) => void): void;
    removeEventListener?(event: string, listener: (selection: number[]) => void): void;
    emit(event: string, selection: number[]): void;
  };
  setHighlightedIds(selection: number[]): void;
  updatePlotSelection(): void;
};
type ChartModalDescriptor = {
  key: ChartKey;
  title: string;
  subtitle: string;
  originalPlot: InteractivePlot;
  events: PlotEvent[];
  trigger: HTMLElement;
  button: HTMLButtonElement | null;
  createModalPlot(container: HTMLElement, width: number, height: number): InteractivePlot;
};
type ChartModalApi = { syncSelection(): void };

let _annotationNodeId: string | null = null;
let _annotationTextarea: HTMLTextAreaElement | null = null;

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

function setupChartModal(descriptors: ChartModalDescriptor[]): ChartModalApi {
  let active: ChartModalDescriptor | null = null;
  let backdrop: HTMLDivElement | null = null;
  let canvas: HTMLDivElement | null = null;
  let stage: HTMLDivElement | null = null;
  let titleEl: HTMLDivElement | null = null;
  let subtitleEl: HTMLDivElement | null = null;
  let scaleEl: HTMLSpanElement | null = null;
  let modalPlot: InteractivePlot | null = null;
  let modalPlotCleanup: Array<() => void> = [];
  let contentWidth = 1;
  let contentHeight = 1;
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let spacePressed = false;
  let dragActive = false;
  let dragX = 0;
  let dragY = 0;

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  function applyTransform(): void {
    if (!stage) return;
    stage.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    if (scaleEl) scaleEl.textContent = `${Math.round(scale * 100)}%`;
  }

  function contentSize(): { width: number; height: number } {
    return { width: Math.max(1, contentWidth), height: Math.max(1, contentHeight) };
  }

  function fit(): void {
    if (!canvas || !stage) return;
    const rect = canvas.getBoundingClientRect();
    const { width, height } = contentSize();
    const padding = 28;
    const fitScale = Math.min(
      (rect.width - padding * 2) / Math.max(1, width),
      (rect.height - padding * 2) / Math.max(1, height)
    );
    scale = clamp(Number.isFinite(fitScale) ? fitScale : 1, 0.3, 4);
    tx = (rect.width - width * scale) / 2;
    ty = (rect.height - height * scale) / 2;
    applyTransform();
  }

  function zoomAt(clientX: number, clientY: number, factor: number): void {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const nextScale = clamp(scale * factor, 0.25, 6);
    const ratio = nextScale / scale;
    tx = localX - (localX - tx) * ratio;
    ty = localY - (localY - ty) * ratio;
    scale = nextScale;
    applyTransform();
  }

  function clearModalPlot(): void {
    modalPlotCleanup.forEach((cleanup) => cleanup());
    modalPlotCleanup = [];
    modalPlot = null;
    if (stage) stage.innerHTML = '';
  }

  function syncSelection(): void {
    if (!active || !modalPlot) return;
    modalPlot.setHighlightedIds([...active.originalPlot.selection]);
  }

  function renderInteractivePlot(): void {
    if (!active || !stage || !titleEl || !subtitleEl || !canvas) return;
    titleEl.textContent = active.title;
    subtitleEl.textContent = active.subtitle;
    clearModalPlot();

    const host = document.createElement('div');
    host.style.width = '100%';
    host.style.height = '100%';
    stage.appendChild(host);

    contentWidth = Math.max(920, canvas.clientWidth - 48);
    contentHeight = Math.max(560, canvas.clientHeight - 48);
    stage.style.width = `${contentWidth}px`;
    stage.style.height = `${contentHeight}px`;
    host.style.width = `${contentWidth}px`;
    host.style.height = `${contentHeight}px`;

    modalPlot = active.createModalPlot(host, contentWidth, contentHeight);
    syncSelection();

    for (const eventName of active.events) {
      const listener = (selection: number[]) => {
        if (!active) return;
        active.originalPlot.selection = [...selection];
        active.originalPlot.updatePlotSelection();
        active.originalPlot.plotEvents.emit(eventName, [...selection]);
        requestAnimationFrame(syncSelection);
      };
      modalPlot.plotEvents.addEventListener(eventName, listener);
      modalPlotCleanup.push(() => {
        modalPlot?.plotEvents.removeEventListener?.(eventName, listener);
      });
    }

    requestAnimationFrame(() => fit());
  }

  function closeModal(): void {
    clearModalPlot();
    backdrop?.remove();
    backdrop = null;
    canvas = null;
    stage = null;
    titleEl = null;
    subtitleEl = null;
    scaleEl = null;
    active = null;
    document.body.style.overflow = '';
  }

  function ensureModal(): void {
    if (backdrop) return;

    backdrop = document.createElement('div');
    backdrop.className = 'chart-modal-backdrop';

    const modal = document.createElement('div');
    modal.className = 'chart-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Expanded chart view');

    const header = document.createElement('div');
    header.className = 'chart-modal-header';

    const heading = document.createElement('div');
    heading.className = 'chart-modal-heading';
    titleEl = document.createElement('div');
    titleEl.className = 'chart-modal-title';
    subtitleEl = document.createElement('div');
    subtitleEl.className = 'chart-modal-subtitle';
    heading.appendChild(titleEl);
    heading.appendChild(subtitleEl);

    const controls = document.createElement('div');
    controls.className = 'chart-modal-controls';

    const makeBtn = (label: string, onClick: () => void): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chart-modal-btn';
      btn.textContent = label;
      btn.addEventListener('click', onClick);
      return btn;
    };

    controls.appendChild(makeBtn('−', () => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 0.85);
    }));
    controls.appendChild(makeBtn('+', () => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.15);
    }));
    controls.appendChild(makeBtn('Fit', fit));
    controls.appendChild(makeBtn('100%', () => {
      scale = 1;
      tx = 24;
      ty = 24;
      applyTransform();
    }));
    controls.appendChild(makeBtn('Close', closeModal));

    header.appendChild(heading);
    header.appendChild(controls);

    const body = document.createElement('div');
    body.className = 'chart-modal-body';

    canvas = document.createElement('div');
    canvas.className = 'chart-modal-canvas';

    stage = document.createElement('div');
    stage.className = 'chart-modal-stage';
    canvas.appendChild(stage);
    body.appendChild(canvas);

    const footer = document.createElement('div');
    footer.className = 'chart-modal-footer';
    const hint = document.createElement('div');
    hint.className = 'chart-modal-hint';
    hint.textContent = 'Mouse wheel to zoom. Hold Space and drag to pan. Press Esc to close.';
    scaleEl = document.createElement('span');
    scaleEl.className = 'chart-modal-scale';
    scaleEl.textContent = '100%';
    footer.appendChild(hint);
    footer.appendChild(scaleEl);

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) closeModal();
    });

    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.12 : 0.9);
    }, { passive: false });

    canvas.addEventListener('pointerdown', (event) => {
      if (!(event.button === 0 && spacePressed)) return;
      dragActive = true;
      dragX = event.clientX;
      dragY = event.clientY;
      canvas!.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    canvas.addEventListener('pointermove', (event) => {
      if (!dragActive) return;
      tx += event.clientX - dragX;
      ty += event.clientY - dragY;
      dragX = event.clientX;
      dragY = event.clientY;
      applyTransform();
    });

    const endDrag = (event: PointerEvent) => {
      if (!dragActive || !canvas) return;
      dragActive = false;
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        // ignore
      }
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
  }

  function openModal(descriptor: ChartModalDescriptor): void {
    active = descriptor;
    ensureModal();
    document.body.style.overflow = 'hidden';
    renderInteractivePlot();
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === ' ') spacePressed = true;
    if (event.key === 'Escape' && backdrop) closeModal();
  });

  document.addEventListener('keyup', (event) => {
    if (event.key === ' ') spacePressed = false;
  });

  window.addEventListener('resize', () => {
    if (!backdrop || !active) return;
    renderInteractivePlot();
  });

  for (const descriptor of descriptors) {
    const open = () => openModal(descriptor);
    descriptor.trigger.addEventListener('click', open);
    descriptor.trigger.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      open();
    });
    descriptor.button?.addEventListener('click', (event) => {
      event.stopPropagation();
      open();
    });
  }

  return { syncSelection };
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
    events: [PlotEvent.CLICK, PlotEvent.BRUSH],
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
    parallelCoordinates: {
      normalization: {
        mode: 'robust',
        quantileClamp: [0.05, 0.95],
      },
    },
    events: [PlotEvent.BRUSH_Y],
  });

  const hist = new Histogram({
    div: histEl, data: geojson,
    labels: { axis: ['shape_area', 'Count'], title: 'Area Distribution' },
    width: hd.width, height: hd.height,
    margins: { left: 55, right: 16, top: 36, bottom: 48 },
    events: [PlotEvent.CLICK],
  });

  const chartModal = setupChartModal([
    {
      key: 'scatter',
      title: 'Scatterplot',
      subtitle: 'Area vs Perimeter · drag to brush',
      originalPlot: scatter,
      events: [PlotEvent.CLICK, PlotEvent.BRUSH],
      trigger: document.querySelector('[data-chart-key="scatter"] .plot-panel-header') as HTMLElement,
      button: document.querySelector('[data-chart-key="scatter"] .panel-expand-btn') as HTMLButtonElement | null,
      createModalPlot: (container, width, height) => new Scatterplot({
        div: container,
        data: geojson,
        labels: { axis: ['shape_area', 'shape_leng'], title: 'Area vs Perimeter' },
        width,
        height,
        margins: { left: 62, right: 16, top: 36, bottom: 48 },
        events: [PlotEvent.CLICK, PlotEvent.BRUSH],
      }),
    },
    {
      key: 'bar',
      title: 'Bar Chart',
      subtitle: 'Neighborhoods per district · click a bar',
      originalPlot: bar,
      events: [PlotEvent.CLICK],
      trigger: document.querySelector('[data-chart-key="bar"] .plot-panel-header') as HTMLElement,
      button: document.querySelector('[data-chart-key="bar"] .panel-expand-btn') as HTMLButtonElement | null,
      createModalPlot: (container, width, height) => new Barchart({
        div: container,
        data: districtData,
        labels: { axis: ['cdta2020', 'count'], title: 'Neighborhoods per District' },
        width,
        height,
        margins: { left: 50, right: 16, top: 36, bottom: 68 },
        events: [PlotEvent.CLICK],
      }),
    },
    {
      key: 'pc',
      title: 'Parallel Coordinates',
      subtitle: 'Area · Perimeter · Compactness · brush any axis',
      originalPlot: pc,
      events: [PlotEvent.BRUSH_Y],
      trigger: document.querySelector('[data-chart-key="pc"] .plot-panel-header') as HTMLElement,
      button: document.querySelector('[data-chart-key="pc"] .panel-expand-btn') as HTMLButtonElement | null,
      createModalPlot: (container, width, height) => new ParallelCoordinates({
        div: container,
        data: geojson,
        labels: { axis: ['shape_area', 'shape_leng', 'compactness'], title: 'Neighborhood Metrics' },
        width,
        height,
        margins: { left: 28, right: 28, top: 36, bottom: 36 },
        parallelCoordinates: {
          normalization: {
            mode: 'robust',
            quantileClamp: [0.05, 0.95],
          },
        },
        events: [PlotEvent.BRUSH_Y],
      }),
    },
    {
      key: 'hist',
      title: 'Histogram',
      subtitle: 'Neighborhood area distribution · click bins to select',
      originalPlot: hist,
      events: [PlotEvent.CLICK],
      trigger: document.querySelector('[data-chart-key="hist"] .plot-panel-header') as HTMLElement,
      button: document.querySelector('[data-chart-key="hist"] .panel-expand-btn') as HTMLButtonElement | null,
      createModalPlot: (container, width, height) => new Histogram({
        div: container,
        data: geojson,
        labels: { axis: ['shape_area', 'Count'], title: 'Area Distribution' },
        width,
        height,
        margins: { left: 55, right: 16, top: 36, bottom: 48 },
        events: [PlotEvent.CLICK],
      }),
    },
  ]);

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
    chartModal.syncSelection();
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
