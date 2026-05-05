import type { AutarkProvenanceApi } from '../create-autark-provenance';
import {
  computeGraphMetrics,
  generateSessionNarrative,
  getInsightAnnotations,
  type StrategyLabel,
} from '../insight-engine';
import { formatDurationShort, truncate } from './utils';

const STRATEGY_COLORS: Record<StrategyLabel, string> = {
  Confirmatory: '#2e7d32',
  Exploratory: '#1565c0',
  'Iterative Refinement': '#6a1b9a',
};

export function renderInsightsPanel(
  container: HTMLElement,
  provenance: AutarkProvenanceApi
): void {
  container.innerHTML = '';

  const graph = provenance.getGraph();
  const currentNode = provenance.getCurrentNode();
  const metrics = computeGraphMetrics(graph);
  const annotations = getInsightAnnotations(graph);

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

      item.addEventListener('click', () => {
        provenance.goToNode(a.nodeId);
      });

      annoSection.appendChild(item);
    }

    container.appendChild(annoSection);
  }

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
