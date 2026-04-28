import type { AutarkProvenanceState, PathNode, ProvenanceNode } from './types';
import type { AutarkProvenanceApi } from './create-autark-provenance';
import {
  computeGraphMetrics,
  generateSessionNarrative,
  getInsightAnnotations,
  type StrategyLabel,
} from './insight-engine';

export interface ProvenanceTrailUIOptions {
  provenance: AutarkProvenanceApi;
  container: HTMLElement;
  insightsContainer?: HTMLElement;
  showBackForward?: boolean;
  showTimestamps?: boolean;
  showGraph?: boolean;
  showPathList?: boolean;
}

type LayoutNode = {
  node: ProvenanceNode<AutarkProvenanceState>;
  x: number;
  y: number;
  depth: number;
  row: number;
};

type LayoutEdge = {
  from: string;
  to: string;
};

type GraphLayout = {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function truncate(text: string, max = 30): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}\u2026`;
}

function buildGraphLayout(
  nodesMap: Map<string, ProvenanceNode<AutarkProvenanceState>>,
  rootId: string
): GraphLayout {
  const depth = new Map<string, number>();
  const row = new Map<string, number>();
  const visited = new Set<string>();
  const edges: LayoutEdge[] = [];

  function assignDepth(nodeId: string, d: number): void {
    if (visited.has(nodeId)) {
      const prev = depth.get(nodeId);
      if (prev === undefined || d < prev) depth.set(nodeId, d);
      return;
    }
    visited.add(nodeId);
    depth.set(nodeId, d);
    const node = nodesMap.get(nodeId);
    if (!node) return;
    for (const childId of node.childrenIds) {
      if (!nodesMap.has(childId)) continue;
      edges.push({ from: nodeId, to: childId });
      assignDepth(childId, d + 1);
    }
  }

  assignDepth(rootId, 0);

  let nextLeafRow = 0;
  function assignRow(nodeId: string): number {
    if (row.has(nodeId)) return row.get(nodeId) ?? 0;
    const node = nodesMap.get(nodeId);
    if (!node) {
      row.set(nodeId, nextLeafRow);
      nextLeafRow += 1;
      return row.get(nodeId) ?? 0;
    }

    const validChildren = node.childrenIds.filter((id) => nodesMap.has(id));
    if (validChildren.length === 0) {
      row.set(nodeId, nextLeafRow);
      nextLeafRow += 1;
      return row.get(nodeId) ?? 0;
    }

    const childRows = validChildren.map(assignRow);
    const avg = childRows.reduce((acc, n) => acc + n, 0) / childRows.length;
    row.set(nodeId, avg);
    return avg;
  }

  assignRow(rootId);

  for (const nodeId of nodesMap.keys()) {
    if (!depth.has(nodeId)) depth.set(nodeId, 0);
    if (!row.has(nodeId)) {
      row.set(nodeId, nextLeafRow);
      nextLeafRow += 1;
    }
  }

  const xGap = 160;
  const yGap = 64;
  const marginX = 28;
  const marginY = 24;

  const layoutNodes: LayoutNode[] = [];
  let maxDepth = 0;
  let maxRow = 0;

  for (const [id, node] of nodesMap.entries()) {
    const d = depth.get(id) ?? 0;
    const r = row.get(id) ?? 0;
    maxDepth = Math.max(maxDepth, d);
    maxRow = Math.max(maxRow, r);
    layoutNodes.push({
      node,
      depth: d,
      row: r,
      x: marginX + d * xGap,
      y: marginY + r * yGap,
    });
  }

  layoutNodes.sort((a, b) => (a.depth === b.depth ? a.row - b.row : a.depth - b.depth));

  const width = marginX * 2 + maxDepth * xGap + 280;
  const height = marginY * 2 + Math.max(1, maxRow) * yGap + 44;

  return { nodes: layoutNodes, edges, width, height };
}

function createSvgElement<T extends keyof SVGElementTagNameMap>(tag: T): SVGElementTagNameMap[T] {
  return document.createElementNS('http://www.w3.org/2000/svg', tag);
}

function createGraphScene(
  layout: GraphLayout,
  currentId: string | null,
  showTimestamps: boolean,
  onNodeClick: (nodeId: string) => void
): SVGGElement {
  const root = createSvgElement('g');
  const positionById = new Map(layout.nodes.map((n) => [n.node.id, n]));

  for (const edge of layout.edges) {
    const from = positionById.get(edge.from);
    const to = positionById.get(edge.to);
    if (!from || !to) continue;

    const path = createSvgElement('path');
    const ctrlDx = Math.max(32, (to.x - from.x) * 0.55);
    path.setAttribute(
      'd',
      `M ${from.x} ${from.y} C ${from.x + ctrlDx} ${from.y}, ${to.x - ctrlDx} ${to.y}, ${to.x} ${to.y}`
    );
    path.setAttribute('class', 'autk-provenance-edge');
    root.appendChild(path);
  }

  for (const item of layout.nodes) {
    const g = createSvgElement('g');
    const isCurrent = item.node.id === currentId;
    const hasAnnotation =
      typeof item.node.metadata?.insight === 'string' &&
      (item.node.metadata.insight as string).trim().length > 0;

    g.setAttribute('class', `autk-provenance-node${isCurrent ? ' autk-provenance-node-current' : ''}`);
    g.setAttribute('transform', `translate(${item.x}, ${item.y})`);

    const circle = createSvgElement('circle');
    circle.setAttribute('class', 'autk-provenance-node-circle');
    circle.setAttribute('r', isCurrent ? '9' : '7');
    g.appendChild(circle);

    // Insight annotation indicator dot (Feature 1)
    if (hasAnnotation) {
      const dot = createSvgElement('circle');
      dot.setAttribute('class', 'autk-provenance-node-insight-dot');
      dot.setAttribute('cx', isCurrent ? '7' : '5');
      dot.setAttribute('cy', isCurrent ? '-7' : '-5');
      dot.setAttribute('r', '4');
      g.appendChild(dot);
    }

    const annotationText = hasAnnotation ? `\n"${(item.node.metadata!.insight as string).trim()}"` : '';
    const title = createSvgElement('title');
    title.textContent = `${item.node.actionLabel} (${item.node.id})${annotationText}`;
    g.appendChild(title);

    const label = createSvgElement('text');
    label.setAttribute('class', 'autk-provenance-node-label');
    label.setAttribute('x', '14');
    label.setAttribute('y', '-2');
    label.textContent = truncate(item.node.actionLabel);
    g.appendChild(label);

    if (showTimestamps) {
      const time = createSvgElement('text');
      time.setAttribute('class', 'autk-provenance-node-time');
      time.setAttribute('x', '14');
      time.setAttribute('y', '12');
      time.textContent = formatTime(item.node.timestamp);
      g.appendChild(time);
    }

    g.addEventListener('click', (event) => {
      event.stopPropagation();
      onNodeClick(item.node.id);
    });

    root.appendChild(g);
  }

  return root;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// Insights panel helpers
// ---------------------------------------------------------------------------

const STRATEGY_COLORS: Record<StrategyLabel, string> = {
  Confirmatory: '#2e7d32',
  Exploratory: '#1565c0',
  'Iterative Refinement': '#6a1b9a',
};

function formatDurationShort(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function renderInsightsPanel(
  container: HTMLElement,
  provenance: AutarkProvenanceApi
): void {
  container.innerHTML = '';

  const graph = provenance.getGraph();
  const currentNode = provenance.getCurrentNode();
  const metrics = computeGraphMetrics(graph);
  const annotations = getInsightAnnotations(graph);

  // ── Strategy + metrics row ────────────────────────────────────────────────
  const metricsRow = document.createElement('div');
  metricsRow.className = 'autk-prov-insights-metrics';

  const badge = document.createElement('span');
  badge.className = 'autk-prov-strategy-badge';
  badge.textContent = metrics.strategyLabel;
  badge.style.background = STRATEGY_COLORS[metrics.strategyLabel];
  metricsRow.appendChild(badge);

  const metaItems: string[] = [];
  if (metrics.sessionDurationMs > 0) {
    metaItems.push(formatDurationShort(metrics.sessionDurationMs));
  }
  metaItems.push(`${metrics.totalNodes} state${metrics.totalNodes !== 1 ? 's' : ''}`);
  if (metrics.branchPoints > 0) {
    metaItems.push(`${metrics.branchPoints} branch${metrics.branchPoints !== 1 ? 'es' : ''}`);
  }
  if (metrics.backtracks > 0) {
    metaItems.push(`${metrics.backtracks} backtrack${metrics.backtracks !== 1 ? 's' : ''}`);
  }

  const metaSpan = document.createElement('span');
  metaSpan.className = 'autk-prov-metrics-meta';
  metaSpan.textContent = metaItems.join('  •  ');
  metricsRow.appendChild(metaSpan);

  container.appendChild(metricsRow);

  // ── Annotate current node (Feature 1: insight provenance) ─────────────────
  const annotateSection = document.createElement('div');
  annotateSection.className = 'autk-prov-insights-section';

  const annotateLabel = document.createElement('div');
  annotateLabel.className = 'autk-prov-insights-section-title';
  annotateLabel.textContent = 'Insight at this step';
  annotateSection.appendChild(annotateLabel);

  const textarea = document.createElement('textarea');
  textarea.className = 'autk-prov-annotation-textarea';
  textarea.placeholder = 'What did you notice or conclude here?';
  textarea.rows = 3;
  if (currentNode) {
    const existing = currentNode.metadata?.insight;
    textarea.value = typeof existing === 'string' ? existing : '';
  } else {
    textarea.disabled = true;
  }
  annotateSection.appendChild(textarea);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'autk-prov-annotation-save';
  saveBtn.textContent = 'Save Insight';
  saveBtn.disabled = !currentNode;
  saveBtn.addEventListener('click', () => {
    if (!currentNode) return;
    provenance.annotateNode(currentNode.id, textarea.value);
    renderInsightsPanel(container, provenance);
  });
  annotateSection.appendChild(saveBtn);

  container.appendChild(annotateSection);

  // ── Recorded insight annotations list ─────────────────────────────────────
  if (annotations.length > 0) {
    const annoSection = document.createElement('div');
    annoSection.className = 'autk-prov-insights-section';

    const annoTitle = document.createElement('div');
    annoTitle.className = 'autk-prov-insights-section-title';
    annoTitle.textContent = `Recorded insights (${annotations.length})`;
    annoSection.appendChild(annoTitle);

    for (const a of annotations) {
      const item = document.createElement('div');
      item.className = 'autk-prov-anno-item';

      const step = document.createElement('div');
      step.className = 'autk-prov-anno-step';
      step.textContent = truncate(a.actionLabel, 24);
      item.appendChild(step);

      const text = document.createElement('div');
      text.className = 'autk-prov-anno-text';
      text.textContent = a.text;
      item.appendChild(text);

      // Click to navigate to that node
      item.addEventListener('click', () => {
        provenance.goToNode(a.nodeId);
      });

      annoSection.appendChild(item);
    }

    container.appendChild(annoSection);
  }

  // ── Auto-generated session narrative (Feature 4: presentation) ─────────────
  const summarySection = document.createElement('div');
  summarySection.className = 'autk-prov-insights-section';

  const summaryTitle = document.createElement('div');
  summaryTitle.className = 'autk-prov-insights-section-title';
  summaryTitle.textContent = 'Analysis summary';
  summarySection.appendChild(summaryTitle);

  const narrative = generateSessionNarrative(graph, metrics, annotations);

  const summaryPre = document.createElement('pre');
  summaryPre.className = 'autk-prov-summary-text';
  summaryPre.textContent = narrative;
  summarySection.appendChild(summaryPre);

  const copyBtn = document.createElement('button');
  copyBtn.className = 'autk-prov-copy-btn';
  copyBtn.textContent = 'Copy to clipboard';
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(narrative).then(() => {
      copyBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyBtn.textContent = 'Copy to clipboard';
      }, 1800);
    });
  });
  summarySection.appendChild(copyBtn);

  container.appendChild(summarySection);
}

// ---------------------------------------------------------------------------
// Main UI renderer
// ---------------------------------------------------------------------------

export function renderProvenanceTrailUI(options: ProvenanceTrailUIOptions): () => void {
  const {
    provenance,
    container,
    insightsContainer,
    showBackForward = true,
    showTimestamps = true,
    showGraph = true,
    showPathList = true,
  } = options;

  if (typeof document !== 'undefined' && document.head) {
    const styleId = 'autk-provenance-trail-styles';
    if (!document.getElementById(styleId)) {
      const el = document.createElement('style');
      el.id = styleId;
      el.textContent = [
        // Core layout
        '.autk-provenance-root{display:flex;flex-direction:column;height:100%;font-family:system-ui,sans-serif;font-size:13px;gap:10px;min-height:0}',
        '.autk-provenance-toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}',
        '.autk-provenance-toolbar-main{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
        '.autk-provenance-toolbar-hint{font-size:11px;color:#5c7389}',
        '.autk-provenance-toggle{padding:6px 10px;border:1px solid #c3cfdb;border-radius:6px;background:#fff;cursor:pointer;font-size:12px;color:#1f344b}',
        '.autk-provenance-toggle:hover{background:#f2f7fd}',
        '.autk-provenance-toggle:disabled{opacity:.55;cursor:not-allowed}',
        // Graph
        '.autk-provenance-graph-wrap{position:relative;border:1px solid #dbe5f0;border-radius:8px;background:#fff;overflow:auto;min-height:280px;height:280px;max-height:360px;cursor:zoom-in}',
        '.autk-provenance-graph-svg{display:block;min-width:100%;max-width:none}',
        '.autk-provenance-edge{stroke:#b9c8d8;stroke-width:1.4;fill:none}',
        '.autk-provenance-node{cursor:pointer}',
        '.autk-provenance-node-circle{fill:#f8fbff;stroke:#6f8baa;stroke-width:1.5}',
        '.autk-provenance-node-current .autk-provenance-node-circle{fill:#dcecff;stroke:#2f5f96;stroke-width:2}',
        '.autk-provenance-node-label{font-size:11px;fill:#1f344b}',
        '.autk-provenance-node-time{font-size:10px;fill:#5c7389}',
        // Insight annotation dot on graph nodes
        '.autk-provenance-node-insight-dot{fill:#f59e0b;stroke:#fff;stroke-width:1.5}',
        // Modal
        '.autk-provenance-modal-backdrop{position:fixed;inset:0;background:rgba(15,27,44,.48);z-index:11000;display:flex;align-items:center;justify-content:center;padding:24px}',
        '.autk-provenance-modal{width:min(1200px,95vw);height:min(860px,90vh);display:flex;flex-direction:column;border-radius:12px;overflow:hidden;background:#f8fbff;box-shadow:0 28px 80px rgba(17,31,47,.45)}',
        '.autk-provenance-modal-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 14px;background:#fff;border-bottom:1px solid #dbe5f0}',
        '.autk-provenance-modal-title{font-size:14px;font-weight:700;color:#1f344b}',
        '.autk-provenance-modal-controls{display:flex;align-items:center;gap:6px}',
        '.autk-provenance-modal-controls button{padding:6px 10px;border:1px solid #c3cfdb;border-radius:6px;background:#fff;color:#1f344b;cursor:pointer;font-size:12px}',
        '.autk-provenance-modal-controls button:hover{background:#edf5ff}',
        '.autk-provenance-modal-body{padding:12px;display:flex;flex:1;min-height:0}',
        '.autk-provenance-modal-canvas{position:relative;flex:1;min-height:0;border:1px solid #dbe5f0;border-radius:8px;background:#fff;overflow:hidden;cursor:grab;touch-action:none}',
        '.autk-provenance-modal-canvas.autk-provenance-panning{cursor:grabbing}',
        '.autk-provenance-modal-svg{display:block;width:100%;height:100%;min-width:0}',
        // Path list
        '.autk-provenance-path{display:flex;flex-direction:column;gap:2px;border:1px solid #dbe5f0;border-radius:8px;background:#fbfdff;max-height:200px;overflow-y:auto}',
        '.autk-provenance-path-item{display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid #e7eef6;cursor:pointer}',
        '.autk-provenance-path-item:last-child{border-bottom:0}',
        '.autk-provenance-path-item:hover{background:#f1f7ff}',
        '.autk-provenance-path-item-current{background:#e8f2ff;font-weight:600}',
        '.autk-provenance-path-label{flex:1;min-width:0}',
        '.autk-provenance-path-time{color:#5c7389;font-size:11px;white-space:nowrap}',
        // Back/forward
        '.autk-provenance-buttons{display:flex;gap:6px}',
        '.autk-provenance-buttons button{padding:6px 12px;border:1px solid #c3cfdb;border-radius:6px;background:#fff;cursor:pointer}',
        '.autk-provenance-buttons button:hover:not(:disabled){background:#f2f7fd}',
        '.autk-provenance-buttons button:disabled{opacity:.55;cursor:not-allowed}',
        // ── Insights panel ──────────────────────────────────────────────────
        '.autk-prov-insights-wrap{border:1px solid #dbe5f0;border-radius:8px;background:#fbfdff;overflow-y:auto;max-height:420px;min-height:0}',
        '.autk-prov-insights-header{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid #e7eef6;cursor:pointer;user-select:none}',
        '.autk-prov-insights-header-label{font-size:12px;font-weight:700;color:#1f344b;letter-spacing:.02em}',
        '.autk-prov-insights-chevron{font-size:11px;color:#5c7389}',
        '.autk-prov-insights-body{padding:8px 10px;display:flex;flex-direction:column;gap:10px}',
        // Metrics row
        '.autk-prov-insights-metrics{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
        '.autk-prov-strategy-badge{display:inline-block;padding:3px 8px;border-radius:20px;font-size:11px;font-weight:700;color:#fff;white-space:nowrap}',
        '.autk-prov-metrics-meta{font-size:11px;color:#5c7389}',
        // Section
        '.autk-prov-insights-section{display:flex;flex-direction:column;gap:5px}',
        '.autk-prov-insights-section-title{font-size:11px;font-weight:700;color:#5c7389;text-transform:uppercase;letter-spacing:.05em}',
        // Annotation textarea
        '.autk-prov-annotation-textarea{width:100%;padding:6px 8px;border:1px solid #c3cfdb;border-radius:6px;font-family:inherit;font-size:12px;resize:vertical;color:#1f344b;background:#fff;box-sizing:border-box}',
        '.autk-prov-annotation-textarea:focus{outline:none;border-color:#2f5f96}',
        '.autk-prov-annotation-save{align-self:flex-start;padding:5px 10px;border:1px solid #c3cfdb;border-radius:6px;background:#fff;cursor:pointer;font-size:12px;color:#1f344b}',
        '.autk-prov-annotation-save:hover:not(:disabled){background:#edf5ff;border-color:#2f5f96;color:#2f5f96}',
        '.autk-prov-annotation-save:disabled{opacity:.5;cursor:not-allowed}',
        // Selection frequency bars
        '.autk-prov-freq-group-label{font-size:11px;color:#1f344b;font-weight:600;margin-top:2px}',
        '.autk-prov-freq-row{display:flex;align-items:center;gap:6px;min-height:18px}',
        '.autk-prov-freq-id{font-size:11px;color:#5c7389;width:48px;flex-shrink:0;font-variant-numeric:tabular-nums}',
        '.autk-prov-freq-bar-wrap{flex:1;height:8px;background:#e7eef6;border-radius:4px;overflow:hidden}',
        '.autk-prov-freq-bar-fill{height:100%;background:#2f5f96;border-radius:4px;transition:width .3s}',
        '.autk-prov-freq-count{font-size:11px;color:#1f344b;width:26px;text-align:right;flex-shrink:0}',
        // Annotation list
        '.autk-prov-anno-item{padding:6px 8px;border-radius:6px;border:1px solid #e7eef6;background:#fff;cursor:pointer}',
        '.autk-prov-anno-item:hover{background:#f1f7ff}',
        '.autk-prov-anno-step{font-size:10px;color:#5c7389;margin-bottom:2px}',
        '.autk-prov-anno-text{font-size:12px;color:#1f344b;line-height:1.4}',
        // Summary narrative
        '.autk-prov-summary-text{margin:0;padding:8px;background:#f0f5fb;border:1px solid #dbe5f0;border-radius:6px;font-size:11px;color:#1f344b;white-space:pre-wrap;word-break:break-word;line-height:1.55;max-height:180px;overflow-y:auto}',
        '.autk-prov-copy-btn{align-self:flex-start;padding:5px 10px;border:1px solid #c3cfdb;border-radius:6px;background:#fff;cursor:pointer;font-size:12px;color:#1f344b}',
        '.autk-prov-copy-btn:hover{background:#edf5ff}',
      ].join('');
      document.head.appendChild(el);
    }
  }

  container.innerHTML = '';
  container.classList.add('autk-provenance-root');

  let graphVisible = showGraph;
  let graphModalOpen = false;
  let graphToggleBtn: HTMLButtonElement | null = null;
  let graphExpandBtn: HTMLButtonElement | null = null;
  let graphHint: HTMLSpanElement | null = null;
  let graphWrap: HTMLDivElement | null = null;
  let pathContainer: HTMLDivElement | null = null;
  let backBtn: HTMLButtonElement | null = null;
  let fwdBtn: HTMLButtonElement | null = null;
  let insightsBodyEl: HTMLDivElement | null = null;
  let insightsOpen = true;

  let graphModalBackdrop: HTMLDivElement | null = null;
  let graphModalCanvas: HTMLDivElement | null = null;
  let graphModalScene: SVGGElement | null = null;
  let graphModalLayout: GraphLayout | null = null;
  let graphModalScale = 1;
  let graphModalTx = 0;
  let graphModalTy = 0;
  let graphModalTransformInitialized = false;

  function applyGraphModalTransform(): void {
    if (!graphModalScene) return;
    graphModalScene.setAttribute(
      'transform',
      `translate(${graphModalTx} ${graphModalTy}) scale(${graphModalScale})`
    );
  }

  function fitGraphModalView(): void {
    if (!graphModalCanvas || !graphModalLayout || !graphModalScene) return;
    const viewportWidth = Math.max(1, graphModalCanvas.clientWidth);
    const viewportHeight = Math.max(1, graphModalCanvas.clientHeight);
    const padding = 52;
    const scaleX = (viewportWidth - padding * 2) / Math.max(1, graphModalLayout.width);
    const scaleY = (viewportHeight - padding * 2) / Math.max(1, graphModalLayout.height);
    const fitScale = clamp(Math.min(scaleX, scaleY), 0.25, 6);
    graphModalScale = Number.isFinite(fitScale) && fitScale > 0 ? fitScale : 1;
    graphModalTx = (viewportWidth - graphModalLayout.width * graphModalScale) / 2;
    graphModalTy = (viewportHeight - graphModalLayout.height * graphModalScale) / 2;
    graphModalTransformInitialized = true;
    applyGraphModalTransform();
  }

  function zoomGraphModal(factor: number, clientX?: number, clientY?: number): void {
    if (!graphModalCanvas || !graphModalScene) return;
    const rect = graphModalCanvas.getBoundingClientRect();
    const x = clientX === undefined ? rect.left + rect.width / 2 : clientX;
    const y = clientY === undefined ? rect.top + rect.height / 2 : clientY;
    const localX = x - rect.left;
    const localY = y - rect.top;
    const nextScale = clamp(graphModalScale * factor, 0.25, 6);
    const ratio = nextScale / graphModalScale;
    graphModalTx = localX - (localX - graphModalTx) * ratio;
    graphModalTy = localY - (localY - graphModalTy) * ratio;
    graphModalScale = nextScale;
    graphModalTransformInitialized = true;
    applyGraphModalTransform();
  }

  function teardownGraphModal(): void {
    graphModalBackdrop?.remove();
    graphModalBackdrop = null;
    graphModalCanvas = null;
    graphModalScene = null;
    graphModalLayout = null;
    graphModalTransformInitialized = false;
  }

  function closeGraphModal(): void {
    graphModalOpen = false;
    teardownGraphModal();
  }

  function ensureGraphModal(): void {
    if (graphModalBackdrop) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'autk-provenance-modal-backdrop';

    const modal = document.createElement('div');
    modal.className = 'autk-provenance-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Provenance graph');

    const header = document.createElement('div');
    header.className = 'autk-provenance-modal-header';

    const title = document.createElement('div');
    title.className = 'autk-provenance-modal-title';
    title.textContent = 'Provenance Graph';

    const controls = document.createElement('div');
    controls.className = 'autk-provenance-modal-controls';

    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.type = 'button';
    zoomOutBtn.textContent = '\u2212';
    zoomOutBtn.setAttribute('aria-label', 'Zoom out');

    const zoomInBtn = document.createElement('button');
    zoomInBtn.type = 'button';
    zoomInBtn.textContent = '+';
    zoomInBtn.setAttribute('aria-label', 'Zoom in');

    const fitBtn = document.createElement('button');
    fitBtn.type = 'button';
    fitBtn.textContent = 'Fit';
    fitBtn.setAttribute('aria-label', 'Fit graph to view');

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Close';
    closeBtn.setAttribute('aria-label', 'Close graph modal');

    controls.appendChild(zoomOutBtn);
    controls.appendChild(zoomInBtn);
    controls.appendChild(fitBtn);
    controls.appendChild(closeBtn);
    header.appendChild(title);
    header.appendChild(controls);

    const body = document.createElement('div');
    body.className = 'autk-provenance-modal-body';

    const canvas = document.createElement('div');
    canvas.className = 'autk-provenance-modal-canvas';
    body.appendChild(canvas);

    modal.appendChild(header);
    modal.appendChild(body);
    backdrop.appendChild(modal);

    backdrop.addEventListener('click', (event) => {
      if (event.target !== backdrop) return;
      closeGraphModal();
      refresh();
    });

    closeBtn.addEventListener('click', () => {
      closeGraphModal();
      refresh();
    });
    zoomInBtn.addEventListener('click', () => zoomGraphModal(1.2));
    zoomOutBtn.addEventListener('click', () => zoomGraphModal(0.84));
    fitBtn.addEventListener('click', () => fitGraphModalView());

    canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        zoomGraphModal(event.deltaY < 0 ? 1.12 : 0.89, event.clientX, event.clientY);
      },
      { passive: false }
    );

    let panning = false;
    let lastX = 0;
    let lastY = 0;

    const stopPanning = (event: PointerEvent) => {
      if (!panning) return;
      panning = false;
      canvas.classList.remove('autk-provenance-panning');
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('.autk-provenance-node')) return;
      panning = true;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.classList.add('autk-provenance-panning');
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    canvas.addEventListener('pointermove', (event) => {
      if (!panning) return;
      graphModalTx += event.clientX - lastX;
      graphModalTy += event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      graphModalTransformInitialized = true;
      applyGraphModalTransform();
    });

    canvas.addEventListener('pointerup', stopPanning);
    canvas.addEventListener('pointercancel', stopPanning);

    document.body?.appendChild(backdrop);
    graphModalBackdrop = backdrop;
    graphModalCanvas = canvas;
  }

  function renderGraphModal(): void {
    if (!graphModalOpen) return;
    ensureGraphModal();
    if (!graphModalCanvas) return;

    graphModalCanvas.innerHTML = '';

    const graph = provenance.getGraph();
    const rootNode = graph.nodes.get(graph.rootId);
    if (!rootNode) return;

    const currentId = provenance.getCurrentNode()?.id ?? null;
    const layout = buildGraphLayout(graph.nodes, graph.rootId);
    graphModalLayout = layout;

    const viewportWidth = Math.max(320, Math.floor(graphModalCanvas.clientWidth));
    const viewportHeight = Math.max(260, Math.floor(graphModalCanvas.clientHeight));

    const svg = createSvgElement('svg');
    svg.classList.add('autk-provenance-modal-svg');
    svg.setAttribute('viewBox', `0 0 ${viewportWidth} ${viewportHeight}`);
    svg.setAttribute('width', String(viewportWidth));
    svg.setAttribute('height', String(viewportHeight));

    const scene = createGraphScene(layout, currentId, showTimestamps, (nodeId) => {
      provenance.goToNode(nodeId);
    });
    graphModalScene = scene;
    svg.appendChild(scene);
    graphModalCanvas.appendChild(svg);

    if (!graphModalTransformInitialized) {
      fitGraphModalView();
    } else {
      applyGraphModalTransform();
    }
  }

  function openGraphModal(): void {
    if (!showGraph || !graphVisible) return;
    graphModalOpen = true;
    graphModalTransformInitialized = false;
    renderGraphModal();
  }

  if (showGraph) {
    const toolbar = document.createElement('div');
    toolbar.className = 'autk-provenance-toolbar';
    const toolbarMain = document.createElement('div');
    toolbarMain.className = 'autk-provenance-toolbar-main';

    graphToggleBtn = document.createElement('button');
    graphToggleBtn.className = 'autk-provenance-toggle';
    graphToggleBtn.textContent = 'Hide Graph';
    toolbarMain.appendChild(graphToggleBtn);

    graphExpandBtn = document.createElement('button');
    graphExpandBtn.className = 'autk-provenance-toggle';
    graphExpandBtn.textContent = 'Open Graph';
    toolbarMain.appendChild(graphExpandBtn);

    toolbar.appendChild(toolbarMain);

    graphHint = document.createElement('span');
    graphHint.className = 'autk-provenance-toolbar-hint';
    graphHint.textContent = 'Click graph preview to open modal';
    toolbar.appendChild(graphHint);

    container.appendChild(toolbar);

    graphWrap = document.createElement('div');
    graphWrap.className = 'autk-provenance-graph-wrap';
    container.appendChild(graphWrap);
  }

  if (showPathList) {
    pathContainer = document.createElement('div');
    pathContainer.className = 'autk-provenance-path';
    pathContainer.setAttribute('role', 'list');
    container.appendChild(pathContainer);
  }

  if (showBackForward) {
    const btnRow = document.createElement('div');
    btnRow.className = 'autk-provenance-buttons';
    backBtn = document.createElement('button');
    backBtn.textContent = '\u2190 Back';
    backBtn.setAttribute('aria-label', 'Go back one step');
    fwdBtn = document.createElement('button');
    fwdBtn.textContent = 'Forward \u2192';
    fwdBtn.setAttribute('aria-label', 'Go forward one step');
    btnRow.appendChild(backBtn);
    btnRow.appendChild(fwdBtn);
    container.appendChild(btnRow);

    backBtn.addEventListener('click', () => {
      provenance.goBackOneStep();
    });
    fwdBtn.addEventListener('click', () => {
      provenance.goForwardOneStep();
    });
  }

  // ── Insights panel (collapsible) ──────────────────────────────────────────
  const insightsWrap = document.createElement('div');
  insightsWrap.className = 'autk-prov-insights-wrap';

  const insightsHeader = document.createElement('div');
  insightsHeader.className = 'autk-prov-insights-header';
  const insightsHeaderLabel = document.createElement('span');
  insightsHeaderLabel.className = 'autk-prov-insights-header-label';
  insightsHeaderLabel.textContent = 'Session Insights';
  const insightsChevron = document.createElement('span');
  insightsChevron.className = 'autk-prov-insights-chevron';
  insightsChevron.textContent = '\u25b4';
  insightsHeader.appendChild(insightsHeaderLabel);
  insightsHeader.appendChild(insightsChevron);
  insightsWrap.appendChild(insightsHeader);

  const insightsBody = document.createElement('div');
  insightsBody.className = 'autk-prov-insights-body';
  insightsWrap.appendChild(insightsBody);
  insightsBodyEl = insightsBody;

  insightsHeader.addEventListener('click', () => {
    insightsOpen = !insightsOpen;
    insightsBody.style.display = insightsOpen ? 'flex' : 'none';
    insightsChevron.textContent = insightsOpen ? '\u25b4' : '\u25be';
  });

  (insightsContainer ?? container).appendChild(insightsWrap);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function updateButtons(): void {
    if (backBtn) backBtn.disabled = !provenance.canGoBack();
    if (fwdBtn) fwdBtn.disabled = !provenance.canGoForward();
  }

  function renderGraph(): void {
    if (!graphWrap) return;
    if (!graphVisible) {
      graphWrap.style.display = 'none';
      return;
    }
    graphWrap.style.display = 'block';
    graphWrap.innerHTML = '';

    const graph = provenance.getGraph();
    const currentId = provenance.getCurrentNode()?.id ?? null;
    const rootNode = graph.nodes.get(graph.rootId);
    if (!rootNode) return;

    const layout = buildGraphLayout(graph.nodes, graph.rootId);

    const svg = createSvgElement('svg');
    svg.classList.add('autk-provenance-graph-svg');
    svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
    svg.setAttribute('width', String(layout.width));
    svg.setAttribute('height', String(layout.height));
    svg.appendChild(
      createGraphScene(layout, currentId, showTimestamps, (nodeId) => {
        provenance.goToNode(nodeId);
      })
    );

    graphWrap.appendChild(svg);
  }

  function renderPath(path: PathNode<AutarkProvenanceState>[]): void {
    if (!pathContainer) return;
    pathContainer.innerHTML = '';
    const currentId = provenance.getCurrentNode()?.id ?? null;

    for (const node of path) {
      const isCurrent = node.id === currentId;
      const item = document.createElement('div');
      item.className = `autk-provenance-path-item${isCurrent ? ' autk-provenance-path-item-current' : ''}`;
      item.setAttribute('role', 'listitem');
      item.setAttribute('data-node-id', node.id);

      const labelSpan = document.createElement('span');
      labelSpan.className = 'autk-provenance-path-label';
      labelSpan.textContent = node.actionLabel;
      item.appendChild(labelSpan);

      // Insight indicator in path list
      const graphNode = provenance.getGraph().nodes.get(node.id);
      const hasAnnotation =
        typeof graphNode?.metadata?.insight === 'string' &&
        (graphNode.metadata.insight as string).trim().length > 0;
      if (hasAnnotation) {
        const dot = document.createElement('span');
        dot.title = graphNode!.metadata!.insight as string;
        dot.style.cssText =
          'display:inline-block;width:8px;height:8px;border-radius:50%;background:#f59e0b;flex-shrink:0';
        item.appendChild(dot);
      }

      if (showTimestamps) {
        const timeSpan = document.createElement('span');
        timeSpan.className = 'autk-provenance-path-time';
        timeSpan.textContent = formatTime(node.timestamp);
        item.appendChild(timeSpan);
      }

      item.addEventListener('click', () => {
        provenance.goToNode(node.id);
      });

      pathContainer.appendChild(item);
    }
  }

  function refresh(): void {
    if (graphToggleBtn) {
      graphToggleBtn.textContent = graphVisible ? 'Hide Graph' : 'Show Graph';
    }
    if (graphExpandBtn) {
      graphExpandBtn.textContent = graphModalOpen ? 'Close Graph' : 'Open Graph';
      graphExpandBtn.disabled = !graphVisible;
    }
    if (graphHint) {
      graphHint.textContent = graphModalOpen
        ? 'Modal open: click nodes to jump state'
        : 'Click graph preview to open modal';
      graphHint.style.visibility = graphVisible ? 'visible' : 'hidden';
    }
    if (showGraph) renderGraph();
    if (graphModalOpen) renderGraphModal();
    if (showPathList) {
      const path = provenance.getPathFromRoot();
      renderPath(path);
    }
    updateButtons();
    if (insightsBodyEl && insightsOpen) {
      renderInsightsPanel(insightsBodyEl, provenance);
    }
  }

  const unsub = provenance.addObserver(() => {
    refresh();
  });

  if (graphToggleBtn) {
    graphToggleBtn.addEventListener('click', () => {
      graphVisible = !graphVisible;
      if (!graphVisible) closeGraphModal();
      refresh();
    });
  }

  if (graphExpandBtn) {
    graphExpandBtn.addEventListener('click', () => {
      if (graphModalOpen) {
        closeGraphModal();
      } else {
        openGraphModal();
      }
      refresh();
    });
  }

  if (graphWrap) {
    graphWrap.addEventListener('click', () => {
      if (!graphVisible || graphModalOpen) return;
      openGraphModal();
      refresh();
    });
  }

  const handleDocKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !graphModalOpen) return;
    closeGraphModal();
    refresh();
  };
  document.addEventListener('keydown', handleDocKeyDown);

  const handleWindowResize = () => {
    if (!graphModalOpen) return;
    renderGraphModal();
  };
  window.addEventListener('resize', handleWindowResize);

  refresh();

  return () => {
    unsub();
    document.removeEventListener('keydown', handleDocKeyDown);
    window.removeEventListener('resize', handleWindowResize);
    closeGraphModal();
    container.innerHTML = '';
    container.classList.remove('autk-provenance-root');
    if (insightsContainer) insightsContainer.innerHTML = '';
  };
}
