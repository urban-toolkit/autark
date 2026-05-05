import type { AutarkProvenanceApi } from './create-autark-provenance';
import { createGraphModalController } from './ui/graph-modal';
import { renderGraphPreview } from './ui/graph-preview';
import { renderInsightsPanel } from './ui/insights-panel';
import { ensureProvenanceTrailStyles } from './ui/styles';
import {
  createGraphSection,
  createInsightsSection,
  createNavButtons,
  createPathSection,
} from './ui/trail-shell';
import { renderPathList } from './ui/trail-path';

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
  const {
    provenance,
    container,
    insightsContainer,
    showBackForward = true,
    showTimestamps = true,
    showGraph = true,
    showPathList = true,
  } = options;

  ensureProvenanceTrailStyles();

  container.innerHTML = '';
  container.classList.add('autk-provenance-root');

  let graphVisible = showGraph;
  let graphWrap: HTMLDivElement | null = null;
  let pathContainer: HTMLDivElement | null = null;
  let insightsBodyEl: HTMLDivElement | null = null;
  let insightsOpen = true;

  let graphToggleBtn: HTMLButtonElement | null = null;
  let graphExpandBtn: HTMLButtonElement | null = null;
  let graphHint: HTMLSpanElement | null = null;
  let backBtn: HTMLButtonElement | null = null;
  let fwdBtn: HTMLButtonElement | null = null;
  let refreshRef = () => {};

  const graphModal = createGraphModalController({
    provenance,
    showTimestamps,
    getEnabled: () => showGraph && graphVisible,
    onRefresh: () => refreshRef(),
  });

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
    renderGraphPreview(graphWrap, provenance, showTimestamps);
  }

  function refresh(): void {
    if (graphToggleBtn) {
      graphToggleBtn.textContent = graphVisible ? 'Hide Graph' : 'Show Graph';
    }
    if (graphExpandBtn) {
      graphExpandBtn.textContent = graphModal.isOpen() ? 'Close Graph' : 'Open Graph';
      graphExpandBtn.disabled = !graphVisible;
    }
    if (graphHint) {
      graphHint.textContent = graphModal.isOpen()
        ? 'Modal open: click nodes to jump state'
        : 'Click graph preview to open modal';
      graphHint.style.visibility = graphVisible ? 'visible' : 'hidden';
    }

    if (showGraph) renderGraph();
    if (graphModal.isOpen()) graphModal.render();
    if (showPathList && pathContainer) {
      renderPathList(pathContainer, provenance.getPathFromRoot(), provenance, showTimestamps);
    }
    updateButtons();
    if (insightsBodyEl && insightsOpen) {
      renderInsightsPanel(insightsBodyEl, provenance);
    }
  }

  if (showGraph) {
    const graphSection = createGraphSection(container);
    graphWrap = graphSection.graphWrap;
    graphToggleBtn = graphSection.graphToggleBtn;
    graphExpandBtn = graphSection.graphExpandBtn;
    graphHint = graphSection.graphHint;
  }

  if (showPathList) {
    pathContainer = createPathSection(container);
  }

  if (showBackForward) {
    const nav = createNavButtons(
      container,
      () => provenance.goBackOneStep(),
      () => provenance.goForwardOneStep()
    );
    backBtn = nav.backBtn;
    fwdBtn = nav.fwdBtn;
  }

  const insightsSection = createInsightsSection(insightsContainer ?? container);
  const insightsWrap = insightsSection.wrap;
  const insightsBody = insightsSection.body;
  const insightsChevron = insightsSection.chevron;
  insightsBodyEl = insightsBody;

  insightsWrap.firstElementChild?.addEventListener('click', () => {
    insightsOpen = !insightsOpen;
    insightsBody.style.display = insightsOpen ? 'flex' : 'none';
    insightsChevron.textContent = insightsOpen ? '\u25b4' : '\u25be';
  });

  const unsub = provenance.addObserver(() => refresh());

  if (graphToggleBtn) {
    graphToggleBtn.addEventListener('click', () => {
      graphVisible = !graphVisible;
      if (!graphVisible) graphModal.close();
      refresh();
    });
  }

  if (graphExpandBtn) {
    graphExpandBtn.addEventListener('click', () => {
      if (graphModal.isOpen()) {
        graphModal.close();
      } else {
        graphModal.open();
      }
      refresh();
    });
  }

  if (graphWrap) {
    graphWrap.addEventListener('click', () => {
      if (!graphVisible || graphModal.isOpen()) return;
      graphModal.open();
      refresh();
    });
  }

  const handleDocKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !graphModal.isOpen()) return;
    graphModal.close();
    refresh();
  };
  document.addEventListener('keydown', handleDocKeyDown);

  const handleWindowResize = () => {
    if (!graphModal.isOpen()) return;
    graphModal.render();
  };
  window.addEventListener('resize', handleWindowResize);

  refreshRef = refresh;
  refresh();

  return () => {
    unsub();
    document.removeEventListener('keydown', handleDocKeyDown);
    window.removeEventListener('resize', handleWindowResize);
    graphModal.close();
    graphModal.destroy();
  };
}
