import {
  computeGraphMetrics,
  computeSelectionFrequency,
  generateSessionNarrative,
  getInsightAnnotations,
  type InsightsProvenanceApi,
  type InsightSelectionState,
  type StrategyLabel,
} from '../insight-engine';
import { formatDurationShort } from './utils';

const STRATEGY_COLORS: Record<StrategyLabel, string> = {
  Confirmatory: '#2e7d32',
  Exploratory: '#1565c0',
  'Iterative Refinement': '#6a1b9a',
};

const STRATEGY_DESCRIPTIONS: Record<StrategyLabel, string> = {
  Confirmatory: 'A focused, linear exploration where the analyst appears to be validating a known hunch.',
  Exploratory: 'A broader scan across multiple directions, with branching used to compare possibilities.',
  'Iterative Refinement': 'A revise-and-compare workflow with meaningful backtracking before converging.',
};

export function renderWorkspaceSessionInsights<T extends InsightSelectionState>(
  container: HTMLElement,
  provenance: InsightsProvenanceApi<T>
): void {
  const graph = provenance.getGraph();
  const metrics = computeGraphMetrics(graph);
  const annotations = getInsightAnnotations(graph);
  const frequency = computeSelectionFrequency(graph);
  const narrative = generateSessionNarrative(graph, metrics, annotations);
  const currentNode = provenance.getCurrentNode();
  const insight = typeof currentNode?.metadata?.insight === 'string' ? currentNode.metadata.insight : '';

  container.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'autk-session-insights-grid';
  grid.appendChild(createOverviewCard(metrics));
  grid.appendChild(createAnnotationCard(provenance, currentNode?.id ?? null, currentNode?.actionLabel ?? 'Current step', insight, container));
  grid.appendChild(createFrequencyCard(frequency));
  grid.appendChild(createSummaryCard(narrative));
  container.appendChild(grid);
}

function createOverviewCard(metrics: ReturnType<typeof computeGraphMetrics>): HTMLElement {
  const card = createCard('Analysis Strategy');
  const body = card.querySelector('.autk-session-insights-card-body') as HTMLElement;
  const badge = document.createElement('span');
  const desc = document.createElement('p');
  const chips = document.createElement('div');

  badge.className = 'autk-session-strategy-badge';
  badge.textContent = metrics.strategyLabel;
  badge.style.background = STRATEGY_COLORS[metrics.strategyLabel];

  desc.className = 'autk-session-strategy-desc';
  desc.textContent = STRATEGY_DESCRIPTIONS[metrics.strategyLabel];

  chips.className = 'autk-session-metrics-row';
  [
    ['Duration', metrics.sessionDurationMs > 0 ? formatDurationShort(metrics.sessionDurationMs) : '0s'],
    ['States', `${metrics.totalNodes}`],
    ['Branches', `${metrics.branchPoints}`],
    ['Backtracks', `${metrics.backtracks}`],
    ['Avg/state', metrics.avgTimePerStateMs > 0 ? formatDurationShort(metrics.avgTimePerStateMs) : '0s'],
    ['Insights', `${metrics.insightCount}`],
  ].forEach(([label, value]) => chips.appendChild(createMetricChip(label, value)));

  body.appendChild(badge);
  body.appendChild(desc);
  body.appendChild(chips);
  return card;
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

function createFrequencyCard(frequency: ReturnType<typeof computeSelectionFrequency>): HTMLElement {
  const card = createCard('Feature Revisits');
  const body = card.querySelector('.autk-session-insights-card-body') as HTMLElement;
  const scroll = document.createElement('div');
  scroll.className = 'autk-session-frequency-scroll';

  const mapEntries = topEntries(frequency.map);
  const plotGroups = [...frequency.plots.entries()]
    .map(([plotId, values]) => ({ plotId, entries: topEntries(values, 4) }))
    .filter((group) => group.entries.length > 0);

  if (mapEntries.length === 0 && plotGroups.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'autk-session-frequency-empty';
    empty.textContent = 'Selections will start appearing here as the session branches and revisits features.';
    scroll.appendChild(empty);
  } else {
    if (mapEntries.length > 0) scroll.appendChild(createFrequencyGroup('Map features', mapEntries));
    plotGroups.forEach((group) => scroll.appendChild(createFrequencyGroup(group.plotId, group.entries)));
  }

  body.appendChild(scroll);
  return card;
}

function createSummaryCard(narrative: string): HTMLElement {
  const card = createCard('Analysis Summary');
  const body = card.querySelector('.autk-session-insights-card-body') as HTMLElement;
  const pre = document.createElement('pre');
  const copy = document.createElement('button');

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

function topEntries(values: Map<number, number>, limit = 5): Array<[number, number]> {
  return [...values.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function createFrequencyGroup(title: string, entries: Array<[number, number]>): HTMLElement {
  const group = document.createElement('div');
  const heading = document.createElement('div');
  const max = Math.max(...entries.map(([, count]) => count), 1);
  group.className = 'autk-session-frequency-group';
  heading.className = 'autk-session-frequency-group-title';
  heading.textContent = title;
  group.appendChild(heading);

  entries.forEach(([id, count]) => {
    const row = document.createElement('div');
    const label = document.createElement('div');
    const bar = document.createElement('div');
    const fill = document.createElement('div');
    const countLabel = document.createElement('div');

    row.className = 'autk-session-frequency-row';
    label.className = 'autk-session-frequency-id';
    label.textContent = `Feature #${id}`;
    bar.className = 'autk-session-frequency-bar';
    fill.className = 'autk-session-frequency-fill';
    fill.style.width = `${(count / max) * 100}%`;
    countLabel.className = 'autk-session-frequency-count';
    countLabel.textContent = `${count}`;
    bar.appendChild(fill);
    row.appendChild(label);
    row.appendChild(bar);
    row.appendChild(countLabel);
    group.appendChild(row);
  });

  return group;
}
