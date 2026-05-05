import type { AutarkProvenanceApi } from './create-autark-provenance';
import { ensureProvenanceTrailStyles } from './ui/styles';
import { createGraphModalController } from './ui/graph-modal';
import { buildLayoutFromProvenance, renderGraphPreview } from './ui/graph-preview';
import { renderPathList } from './ui/path-list';
import { createGraphToolbar, createInsightsShell, createNavigationButtons } from './ui/toolbar';
import { renderInsightsPanel } from './ui/insights-panel';

export interface ProvenanceTrailUIOptions {
  provenance: AutarkProvenanceApi;
  container: HTMLElement;
  insightsContainer?: HTMLElement;
  showBackForward?: boolean;
  showTimestamps?: boolean;
  showGraph?: boolean;
  showPathList?: boolean;
}

export function renderProvenanceTrailUI(options: ProvenanceTrailUIOptions): () => void {
  const { provenance, container, insightsContainer, showBackForward = true, showTimestamps = true, showGraph = true, showPathList = true } = options;
  ensureProvenanceTrailStyles();
  container.innerHTML = '';
  container.classList.add('autk-provenance-root');

  let graphVisible = showGraph;
  const toolbar = showGraph ? createGraphToolbar() : null;
  const graphWrap = showGraph ? document.createElement('div') : null;
  const pathContainer = showPathList ? document.createElement('div') : null;
  const navigation = showBackForward ? createNavigationButtons() : null;
  const insights = createInsightsShell(insightsContainer ?? container);
  const modal = createGraphModalController({ provenance, showTimestamps, buildLayout: () => buildLayoutFromProvenance(provenance), onRefresh: refresh });

  if (toolbar && graphWrap) {
    graphWrap.className = 'autk-provenance-graph-wrap';
    toolbar.toggleButton.addEventListener('click', () => { graphVisible = !graphVisible; if (!graphVisible) modal.close(); refresh(); });
    toolbar.expandButton.addEventListener('click', () => { modal.isOpen() ? modal.close() : modal.open(); refresh(); });
    graphWrap.addEventListener('click', () => { if (graphVisible && !modal.isOpen()) { modal.open(); refresh(); } });
    container.appendChild(toolbar.toolbar);
    container.appendChild(graphWrap);
  }

  if (pathContainer) {
    pathContainer.className = 'autk-provenance-path';
    pathContainer.setAttribute('role', 'list');
    container.appendChild(pathContainer);
  }
  if (navigation) {
    navigation.backButton.addEventListener('click', () => provenance.goBackOneStep());
    navigation.forwardButton.addEventListener('click', () => provenance.goForwardOneStep());
    container.appendChild(navigation.row);
  }

  function refresh(): void {
    if (toolbar) {
      toolbar.toggleButton.textContent = graphVisible ? 'Hide Graph' : 'Show Graph';
      toolbar.expandButton.textContent = modal.isOpen() ? 'Close Graph' : 'Open Graph';
      toolbar.expandButton.disabled = !graphVisible;
      toolbar.hint.textContent = modal.isOpen() ? 'Modal open: click nodes to jump state' : 'Click graph preview to open modal';
      toolbar.hint.style.visibility = graphVisible ? 'visible' : 'hidden';
    }
    if (graphWrap) {
      graphWrap.style.display = graphVisible ? 'block' : 'none';
      if (graphVisible) renderGraphPreview({ container: graphWrap, provenance, showTimestamps });
    }
    if (pathContainer) renderPathList({ container: pathContainer, provenance, path: provenance.getPathFromRoot(), showTimestamps });
    if (navigation) {
      navigation.backButton.disabled = !provenance.canGoBack();
      navigation.forwardButton.disabled = !provenance.canGoForward();
    }
    if (insights.isOpen()) renderInsightsPanel(insights.body, provenance);
    if (modal.isOpen()) modal.render();
  }

  const unsubscribe = provenance.addObserver(() => refresh());
  const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && modal.isOpen()) { modal.close(); refresh(); } };
  const handleResize = () => modal.isOpen() && modal.render();
  document.addEventListener('keydown', handleKeyDown);
  window.addEventListener('resize', handleResize);
  refresh();

  return () => {
    unsubscribe();
    document.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('resize', handleResize);
    modal.close();
    container.innerHTML = '';
    container.classList.remove('autk-provenance-root');
    if (insightsContainer) insightsContainer.innerHTML = '';
  };
}
