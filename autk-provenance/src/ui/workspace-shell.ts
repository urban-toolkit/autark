export interface WorkspaceShell {
  root: HTMLElement;
  mapBody: HTMLElement;
  thematicSelect: HTMLSelectElement;
  nodeCountBadge: HTMLElement;
  chartsTab: HTMLElement;
  provenanceTab: HTMLElement;
  provenanceTrail: HTMLElement;
  provenanceInsights: HTMLElement;
  chartsInsights: HTMLElement;
  plotPanels: Record<'scatter' | 'bar' | 'parallel' | 'histogram', {
    title: HTMLElement;
    hint: HTMLElement;
    header: HTMLElement;
    body: HTMLElement;
    button: HTMLButtonElement | null;
  }>;
}

function getPlotPanel(root: ParentNode, key: 'scatter' | 'bar' | 'parallel' | 'histogram') {
  const panel = root.querySelector(`[data-chart-key="${key}"]`)!;
  return {
    title: panel.querySelector('.autk-workspace-panel-title') as HTMLElement,
    hint: panel.querySelector('.autk-workspace-panel-hint') as HTMLElement,
    header: panel.querySelector('.autk-workspace-plot-header') as HTMLElement,
    body: panel.querySelector('.autk-workspace-plot-body-inner') as HTMLElement,
    button: panel.querySelector('.autk-workspace-expand-btn') as HTMLButtonElement | null,
  };
}

export function createInsightsWorkspaceShell(container: HTMLElement, title?: string, description?: string): WorkspaceShell {
  container.innerHTML = `
    <div class="autk-insights-workspace">
      ${title ? `<div class="autk-workspace-header"><div><h1>${title}</h1>${description ? `<p>${description}</p>` : ''}</div></div>` : ''}
      <div class="autk-workspace-layout">
        <section class="autk-workspace-panel autk-workspace-map-panel">
          <div class="autk-workspace-panel-header">
            <span class="autk-workspace-panel-title">Map</span>
            <label class="autk-workspace-select-wrap">Color by
              <select class="autk-workspace-select"><option value="">None</option></select>
            </label>
          </div>
          <div class="autk-workspace-map-body"></div>
        </section>
        <section class="autk-workspace-panel autk-workspace-side-panel">
          <div class="autk-workspace-tabbar">
            <button class="autk-workspace-tab active" data-tab="charts">
              <span class="autk-workspace-tab-label">Charts</span>
              <span class="autk-workspace-tab-meta">4 chart types · brush or click to select</span>
            </button>
            <button class="autk-workspace-tab" data-tab="provenance">
              <span class="autk-workspace-tab-label">Provenance Trail</span>
              <span class="autk-workspace-tab-meta autk-workspace-badge">0 steps recorded</span>
            </button>
          </div>
          <div class="autk-workspace-tab-content" data-panel="charts">
            <div class="autk-workspace-plot-grid">
              ${['scatter', 'bar', 'parallel', 'histogram'].map((key) => `
                <article class="autk-workspace-plot-card" data-chart-key="${key}">
                  <div class="autk-workspace-panel-header autk-workspace-plot-header" role="button" tabindex="0">
                    <div class="autk-workspace-panel-header-main">
                      <span class="autk-workspace-panel-title"></span>
                      <span class="autk-workspace-panel-hint"></span>
                    </div>
                    <button class="autk-workspace-expand-btn" type="button">Open</button>
                  </div>
                  <div class="autk-workspace-plot-body"><div class="autk-workspace-plot-body-inner"></div></div>
                </article>
              `).join('')}
            </div>
          </div>
          <div class="autk-workspace-tab-content autk-workspace-hidden" data-panel="provenance">
            <div class="autk-workspace-provenance-grid">
              <div class="autk-workspace-provenance-main"><div class="autk-workspace-trail"></div></div>
              <div class="autk-workspace-provenance-side"><div class="autk-workspace-insights-slot"></div></div>
            </div>
          </div>
        </section>
      </div>
      <section class="autk-workspace-panel autk-workspace-session-insights" data-charts-only="true">
        <div class="autk-workspace-panel-header">
          <span class="autk-workspace-panel-title">Session Insights</span>
          <span class="autk-workspace-panel-hint">Updates as you interact with any visualization</span>
        </div>
        <div class="autk-workspace-session-insights-body"></div>
      </section>
    </div>
  `;

  return {
    root: container.firstElementChild as HTMLElement,
    mapBody: container.querySelector('.autk-workspace-map-body') as HTMLElement,
    thematicSelect: container.querySelector('.autk-workspace-select') as HTMLSelectElement,
    nodeCountBadge: container.querySelector('.autk-workspace-badge') as HTMLElement,
    chartsTab: container.querySelector('[data-panel="charts"]') as HTMLElement,
    provenanceTab: container.querySelector('[data-panel="provenance"]') as HTMLElement,
    provenanceTrail: container.querySelector('.autk-workspace-trail') as HTMLElement,
    provenanceInsights: container.querySelector('.autk-workspace-insights-slot') as HTMLElement,
    chartsInsights: container.querySelector('.autk-workspace-session-insights-body') as HTMLElement,
    plotPanels: {
      scatter: getPlotPanel(container, 'scatter'),
      bar: getPlotPanel(container, 'bar'),
      parallel: getPlotPanel(container, 'parallel'),
      histogram: getPlotPanel(container, 'histogram'),
    },
  };
}
