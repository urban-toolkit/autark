import { FeatureCollection } from 'geojson';
import { SpatialDb } from 'autk-db';
import { PlotEvent, Scatterplot } from 'autk-plot';
import { AutkMap, MapEvent, VectorLayer } from 'autk-map';
import {
  createAutarkProvenance,
  renderProvenanceTrailUI,
  computeGraphMetrics,
  computeSelectionFrequency,
  getInsightAnnotations,
  generateSessionNarrative,
  type StrategyLabel,
} from 'autk-provenance';

// ---------------------------------------------------------------------------
// Strategy colours (mirrors insight-engine classification)
// ---------------------------------------------------------------------------
const STRATEGY_COLORS: Record<StrategyLabel, string> = {
  Confirmatory: '#2e7d32',
  Exploratory: '#1565c0',
  'Iterative Refinement': '#6a1b9a',
};

const STRATEGY_DESC: Record<StrategyLabel, string> = {
  Confirmatory: 'Focused, linear exploration — you appear to know what you are looking for.',
  Exploratory: 'Broad, open-ended investigation with multiple diverging paths.',
  'Iterative Refinement': 'Hypothesis-driven: repeated backtracking and revision of prior selections.',
};

// ---------------------------------------------------------------------------
// Insight card renderers
// ---------------------------------------------------------------------------

function renderMetricsCard(el: HTMLElement, provenance: ReturnType<typeof createAutarkProvenance>): void {
  const graph = provenance.getGraph();
  const m = computeGraphMetrics(graph);

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

  const chips: [string, string][] = [
    ['States', String(m.totalNodes)],
    ['Branch points', String(m.branchPoints)],
    ['Backtracks', String(m.backtracks)],
    ['Max depth', String(m.maxDepth)],
    ['Insights noted', String(m.insightCount)],
  ];

  if (m.sessionDurationMs > 0) {
    const s = Math.round(m.sessionDurationMs / 1000);
    const dur = s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
    chips.unshift(['Duration', dur]);
  }

  const row = document.createElement('div');
  row.className = 'metrics-row';
  for (const [label, value] of chips) {
    const chip = document.createElement('div');
    chip.className = 'metric-chip';
    chip.innerHTML = `<strong>${value}</strong> ${label}`;
    row.appendChild(chip);
  }
  el.appendChild(row);
}

// Keep annotation textarea stable across re-renders — only recreate when node changes
let _annotationNodeId: string | null = null;
let _annotationTextarea: HTMLTextAreaElement | null = null;

function renderAnnotateCard(el: HTMLElement, provenance: ReturnType<typeof createAutarkProvenance>): void {
  const currentNode = provenance.getCurrentNode();

  if (!currentNode) {
    el.innerHTML = '<span style="font-size:12px;color:#546b80">No active state.</span>';
    _annotationNodeId = null;
    _annotationTextarea = null;
    return;
  }

  // If same node, just sync the textarea value (don't wipe the DOM)
  if (currentNode.id === _annotationNodeId && _annotationTextarea) {
    if (!_annotationTextarea.matches(':focus')) {
      const existing = currentNode.metadata?.insight;
      _annotationTextarea.value = typeof existing === 'string' ? existing : '';
    }
    return;
  }

  // New node — rebuild the card
  _annotationNodeId = currentNode.id;
  el.innerHTML = '';

  const label = document.createElement('p');
  label.className = 'annotation-label';
  label.textContent = `Current step: "${currentNode.actionLabel}"`;
  el.appendChild(label);

  const textarea = document.createElement('textarea');
  textarea.className = 'annotation-textarea';
  textarea.placeholder = 'What did you notice or conclude at this step?';
  const existing = currentNode.metadata?.insight;
  textarea.value = typeof existing === 'string' ? existing : '';
  el.appendChild(textarea);
  _annotationTextarea = textarea;

  const saveBtn = document.createElement('button');
  saveBtn.className = 'annotation-save-btn';
  saveBtn.textContent = 'Save Insight';
  saveBtn.addEventListener('click', () => {
    provenance.annotateNode(currentNode.id, textarea.value.trim());
    saveBtn.textContent = 'Saved!';
    setTimeout(() => { saveBtn.textContent = 'Save Insight'; }, 1500);
  });
  el.appendChild(saveBtn);
}

function renderFreqCard(el: HTMLElement, provenance: ReturnType<typeof createAutarkProvenance>): void {
  const graph = provenance.getGraph();
  const freq = computeSelectionFrequency(graph);

  const topMap = [...freq.map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const topPlot = [...freq.plot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  el.innerHTML = '';

  if (topMap.length === 0 && topPlot.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'freq-empty';
    empty.textContent = 'No selections yet. Click features on the map or brush the scatterplot.';
    el.appendChild(empty);
    return;
  }

  const maxCount = Math.max(...[...topMap, ...topPlot].map(([, c]) => c), 1);

  const renderGroup = (label: string, items: [number, number][]): void => {
    if (items.length === 0) return;

    const groupLabel = document.createElement('div');
    groupLabel.className = 'freq-group-label';
    groupLabel.textContent = label;
    el.appendChild(groupLabel);

    for (const [id, count] of items) {
      const row = document.createElement('div');
      row.className = 'freq-row';

      const idSpan = document.createElement('span');
      idSpan.className = 'freq-id';
      idSpan.textContent = `#${id}`;
      row.appendChild(idSpan);

      const barWrap = document.createElement('div');
      barWrap.className = 'freq-bar-wrap';
      const fill = document.createElement('div');
      fill.className = 'freq-bar-fill';
      fill.style.width = `${Math.round((count / maxCount) * 100)}%`;
      barWrap.appendChild(fill);
      row.appendChild(barWrap);

      const countSpan = document.createElement('span');
      countSpan.className = 'freq-count';
      countSpan.textContent = `${count}×`;
      row.appendChild(countSpan);

      el.appendChild(row);
    }
  };

  renderGroup('Map features', topMap);
  renderGroup('Plot features', topPlot);
}

function renderSummaryCard(el: HTMLElement, provenance: ReturnType<typeof createAutarkProvenance>): void {
  const graph = provenance.getGraph();
  const metrics = computeGraphMetrics(graph);
  const annotations = getInsightAnnotations(graph);
  const narrative = generateSessionNarrative(graph, metrics, annotations);

  el.innerHTML = '';

  const pre = document.createElement('pre');
  pre.className = 'summary-pre';
  pre.textContent = narrative;
  el.appendChild(pre);

  const copyBtn = document.createElement('button');
  copyBtn.className = 'copy-btn';
  copyBtn.textContent = 'Copy to clipboard';
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(narrative).then(() => {
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy to clipboard'; }, 1800);
    });
  });
  el.appendChild(copyBtn);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const db = new SpatialDb();
  await db.init();
  await db.loadCustomLayer({
    geojsonFileUrl: '/data/mnt_neighs_proj.geojson',
    outputTableName: 'neighborhoods',
  });
  const geojson = await db.getLayer('neighborhoods') as FeatureCollection;

  const canvas = document.querySelector('canvas') as HTMLCanvasElement;
  const plotBody = document.querySelector('#plotBody') as HTMLElement;
  const trailContainer = document.querySelector('#provenanceTrail') as HTMLElement;

  if (!canvas || !plotBody) {
    console.error('Canvas or plot body not found');
    return;
  }

  const map = new AutkMap(canvas);
  await map.init();
  map.loadGeoJsonLayer('neighborhoods', geojson);
  map.updateRenderInfoProperty('neighborhoods', 'isPick', true);
  map.draw();

  const plotWidth = Math.max(320, Math.floor(plotBody.getBoundingClientRect().width));
  const plotHeight = Math.max(500, Math.floor(plotBody.getBoundingClientRect().height || 500));

  const plot = new Scatterplot({
    div: plotBody,
    data: geojson,
    labels: { axis: ['shape_area', 'shape_leng'], title: 'Plot with provenance' },
    width: plotWidth,
    height: plotHeight,
    events: [PlotEvent.BRUSH],
  });

  map.mapEvents.addEventListener(MapEvent.PICK, (selection: number[]) => {
    plot.setHighlightedIds(selection);
  });
  plot.plotEvents.addEventListener(PlotEvent.BRUSH, (selection: number[]) => {
    const layer = map.layerManager.searchByLayerId('neighborhoods') as VectorLayer | null;
    if (!layer) return;
    if (selection.length === 0) {
      layer.clearHighlightedIds();
    } else {
      layer.setHighlightedIds(selection);
    }
  });

  const provenance = createAutarkProvenance({ map, plot, db });

  // ── Export / Import ──────────────────────────────────────────────────────
  const exportBtn = document.querySelector('#exportBtn') as HTMLButtonElement;
  const importBtn = document.querySelector('#importBtn') as HTMLButtonElement;
  const importFile = document.querySelector('#importFile') as HTMLInputElement;

  exportBtn.addEventListener('click', () => {
    const json = provenance.exportGraph();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `provenance-session-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  importBtn.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', () => {
    const file = importFile.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const json = e.target?.result as string;
      provenance.importGraph(json);
    };
    reader.readAsText(file);
    importFile.value = '';
  });

  // ── Provenance trail sidebar ──────────────────────────────────────────────
  if (trailContainer) {
    renderProvenanceTrailUI({
      provenance,
      container: trailContainer,
      showBackForward: true,
      showTimestamps: true,
      showGraph: true,
      showPathList: true,
    });
  }

  // ── Session Insights section ──────────────────────────────────────────────
  const cardMetrics  = document.querySelector('#insightsMetrics .insights-card-body')  as HTMLElement;
  const cardAnnotate = document.querySelector('#insightsAnnotate .insights-card-body') as HTMLElement;
  const cardFreq     = document.querySelector('#insightsFreq .insights-card-body')     as HTMLElement;
  const cardSummary  = document.querySelector('#insightsSummary .insights-card-body')  as HTMLElement;

  function refreshInsights(): void {
    if (cardMetrics)  renderMetricsCard(cardMetrics, provenance);
    if (cardAnnotate) renderAnnotateCard(cardAnnotate, provenance);
    if (cardFreq)     renderFreqCard(cardFreq, provenance);
    if (cardSummary)  renderSummaryCard(cardSummary, provenance);
  }

  provenance.addObserver(() => refreshInsights());
  refreshInsights();
}

main();
