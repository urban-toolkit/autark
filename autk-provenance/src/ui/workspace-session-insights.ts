import {
  computeGraphMetrics,
  generateSessionNarrative,
  getInsightAnnotations,
  type InsightsProvenanceApi,
  type InsightSelectionState,
} from '../insight-engine';

export function renderWorkspaceSessionInsights<T extends InsightSelectionState>(
  container: HTMLElement,
  provenance: InsightsProvenanceApi<T>
): void {
  const graph = provenance.getGraph();
  const metrics = computeGraphMetrics(graph);
  const annotations = getInsightAnnotations(graph);
  const narrative = generateSessionNarrative(graph, metrics, annotations);
  const currentNode = provenance.getCurrentNode();
  const insight = typeof currentNode?.metadata?.insight === 'string' ? currentNode.metadata.insight : '';

  container.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'autk-session-insights-grid';
  grid.appendChild(createAnnotationCard(provenance, currentNode?.id ?? null, currentNode?.actionLabel ?? 'Current step', insight, container));
  grid.appendChild(createSummaryCard(metrics, narrative));
  container.appendChild(grid);
}

function createAnnotationCard(
  provenance: InsightsProvenanceApi,
  nodeId: string | null,
  actionLabel: string,
  insight: string,
  container: HTMLElement
): HTMLElement {
  const card = createCard('Annotate This Step');
  const body = card.querySelector('.autk-session-insights-card-body') as HTMLElement;
  const step = document.createElement('div');
  const textarea = document.createElement('textarea');
  const save = document.createElement('button');

  step.className = 'autk-session-insights-step';
  step.textContent = `Step: ${actionLabel}`;
  textarea.className = 'autk-session-annotation-textarea';
  textarea.placeholder = 'Capture what stands out at this point in the analysis.';
  textarea.value = insight;
  textarea.disabled = !nodeId;
  save.className = 'autk-session-button';
  save.textContent = 'Save Insight';
  save.disabled = !nodeId;
  save.addEventListener('click', () => {
    if (!nodeId) return;
    provenance.annotateNode(nodeId, textarea.value);
    renderWorkspaceSessionInsights(container, provenance);
  });

  body.appendChild(step);
  body.appendChild(textarea);
  body.appendChild(save);
  return card;
}

function createSummaryCard(metrics: ReturnType<typeof computeGraphMetrics>, narrative: string): HTMLElement {
  const card = createCard('Analysis Summary');
  const body = card.querySelector('.autk-session-insights-card-body') as HTMLElement;
  const chips = document.createElement('div');
  const pre = document.createElement('pre');
  const copy = document.createElement('button');

  chips.className = 'autk-session-metrics-row';
  [
    ['States', `${metrics.totalNodes}`],
    ['Branches', `${metrics.branchPoints}`],
    ['Backtracks', `${metrics.backtracks}`],
    ['Insights', `${metrics.insightCount}`],
  ].forEach(([label, value]) => chips.appendChild(createMetricChip(label, value)));
  pre.className = 'autk-session-summary';
  pre.textContent = narrative;
  copy.className = 'autk-session-button';
  copy.textContent = 'Copy to clipboard';
  copy.addEventListener('click', () => {
    navigator.clipboard.writeText(narrative).then(() => {
      copy.textContent = 'Copied!';
      setTimeout(() => { copy.textContent = 'Copy to clipboard'; }, 1800);
    });
  });

  body.appendChild(chips);
  body.appendChild(pre);
  body.appendChild(copy);
  return card;
}

function createCard(title: string): HTMLElement {
  const card = document.createElement('section');
  const heading = document.createElement('div');
  const body = document.createElement('div');
  card.className = 'autk-session-insights-card';
  heading.className = 'autk-session-insights-card-title';
  heading.textContent = title;
  body.className = 'autk-session-insights-card-body';
  card.appendChild(heading);
  card.appendChild(body);
  return card;
}

function createMetricChip(label: string, value: string): HTMLElement {
  const chip = document.createElement('div');
  chip.className = 'autk-session-metric-chip';
  chip.innerHTML = `<strong>${label}:</strong> ${value}`;
  return chip;
}
