import type { AutarkProvenanceApi } from '../create-autark-provenance';
import { computeGraphMetrics, generateSessionNarrative, getInsightAnnotations, type StrategyLabel } from '../insight-engine';
import { formatDurationShort, truncate } from './utils';

const STRATEGY_COLORS: Record<StrategyLabel, string> = {
  Confirmatory: '#2e7d32',
  Exploratory: '#1565c0',
  'Iterative Refinement': '#6a1b9a',
};

export function renderInsightsPanel(container: HTMLElement, provenance: AutarkProvenanceApi): void {
  const graph = provenance.getGraph();
  const currentNode = provenance.getCurrentNode();
  const metrics = computeGraphMetrics(graph);
  const annotations = getInsightAnnotations(graph);
  const narrative = generateSessionNarrative(graph, metrics, annotations);
  container.innerHTML = '';

  const metricsRow = document.createElement('div');
  metricsRow.className = 'autk-prov-insights-metrics';
  const badge = document.createElement('span');
  badge.className = 'autk-prov-strategy-badge';
  badge.textContent = metrics.strategyLabel;
  badge.style.background = STRATEGY_COLORS[metrics.strategyLabel];
  const meta = document.createElement('span');
  meta.className = 'autk-prov-metrics-meta';
  meta.textContent = [
    metrics.sessionDurationMs > 0 ? formatDurationShort(metrics.sessionDurationMs) : null,
    `${metrics.totalNodes} state${metrics.totalNodes !== 1 ? 's' : ''}`,
    metrics.branchPoints > 0 ? `${metrics.branchPoints} branch${metrics.branchPoints !== 1 ? 'es' : ''}` : null,
    metrics.backtracks > 0 ? `${metrics.backtracks} backtrack${metrics.backtracks !== 1 ? 's' : ''}` : null,
  ].filter(Boolean).join('  •  ');
  metricsRow.appendChild(badge);
  metricsRow.appendChild(meta);
  container.appendChild(metricsRow);

  container.appendChild(createAnnotationEditor(provenance, container, currentNode?.id ?? null, typeof currentNode?.metadata?.insight === 'string' ? currentNode.metadata.insight : ''));
  if (annotations.length > 0) container.appendChild(createAnnotationsList(provenance, annotations));
  container.appendChild(createSummarySection(narrative));
}

function createAnnotationEditor(
  provenance: AutarkProvenanceApi,
  container: HTMLElement,
  nodeId: string | null,
  existingInsight: string
): HTMLElement {
  const section = createSection('Insight at this step');
  const textarea = document.createElement('textarea');
  const save = document.createElement('button');
  textarea.className = 'autk-prov-annotation-textarea';
  textarea.placeholder = 'What did you notice or conclude here?';
  textarea.rows = 3;
  textarea.value = existingInsight;
  textarea.disabled = !nodeId;
  save.className = 'autk-prov-annotation-save';
  save.textContent = 'Save Insight';
  save.disabled = !nodeId;
  save.addEventListener('click', () => {
    if (!nodeId) return;
    provenance.annotateNode(nodeId, textarea.value);
    renderInsightsPanel(container, provenance);
  });
  section.appendChild(textarea);
  section.appendChild(save);
  return section;
}

function createAnnotationsList(
  provenance: AutarkProvenanceApi,
  annotations: ReturnType<typeof getInsightAnnotations>
): HTMLElement {
  const section = createSection(`Recorded insights (${annotations.length})`);
  annotations.forEach((annotation) => {
    const item = document.createElement('div');
    const step = document.createElement('div');
    const text = document.createElement('div');
    item.className = 'autk-prov-anno-item';
    step.className = 'autk-prov-anno-step';
    text.className = 'autk-prov-anno-text';
    step.textContent = truncate(annotation.actionLabel, 24);
    text.textContent = annotation.text;
    item.appendChild(step);
    item.appendChild(text);
    item.addEventListener('click', () => provenance.goToNode(annotation.nodeId));
    section.appendChild(item);
  });
  return section;
}

function createSummarySection(narrative: string): HTMLElement {
  const section = createSection('Analysis summary');
  const summary = document.createElement('pre');
  const copyButton = document.createElement('button');
  summary.className = 'autk-prov-summary-text';
  summary.textContent = narrative;
  copyButton.className = 'autk-prov-copy-btn';
  copyButton.textContent = 'Copy to clipboard';
  copyButton.addEventListener('click', () => {
    navigator.clipboard.writeText(narrative).then(() => {
      copyButton.textContent = 'Copied!';
      setTimeout(() => { copyButton.textContent = 'Copy to clipboard'; }, 1800);
    });
  });
  section.appendChild(summary);
  section.appendChild(copyButton);
  return section;
}

function createSection(titleText: string): HTMLDivElement {
  const section = document.createElement('div');
  const title = document.createElement('div');
  section.className = 'autk-prov-insights-section';
  title.className = 'autk-prov-insights-section-title';
  title.textContent = titleText;
  section.appendChild(title);
  return section;
}
