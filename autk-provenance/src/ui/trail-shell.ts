export interface GraphSectionElements {
  graphWrap: HTMLDivElement;
  graphToggleBtn: HTMLButtonElement;
  graphExpandBtn: HTMLButtonElement;
  graphHint: HTMLSpanElement;
}

export interface InsightsSectionElements {
  wrap: HTMLDivElement;
  body: HTMLDivElement;
  chevron: HTMLSpanElement;
}

export function createGraphSection(container: HTMLElement): GraphSectionElements {
  const toolbar = document.createElement('div');
  toolbar.className = 'autk-provenance-toolbar';
  const toolbarMain = document.createElement('div');
  toolbarMain.className = 'autk-provenance-toolbar-main';

  const graphToggleBtn = document.createElement('button');
  graphToggleBtn.className = 'autk-provenance-toggle';
  toolbarMain.appendChild(graphToggleBtn);

  const graphExpandBtn = document.createElement('button');
  graphExpandBtn.className = 'autk-provenance-toggle';
  toolbarMain.appendChild(graphExpandBtn);

  const graphHint = document.createElement('span');
  graphHint.className = 'autk-provenance-toolbar-hint';

  toolbar.appendChild(toolbarMain);
  toolbar.appendChild(graphHint);
  container.appendChild(toolbar);

  const graphWrap = document.createElement('div');
  graphWrap.className = 'autk-provenance-graph-wrap';
  container.appendChild(graphWrap);

  return { graphWrap, graphToggleBtn, graphExpandBtn, graphHint };
}

export function createPathSection(container: HTMLElement): HTMLDivElement {
  const pathContainer = document.createElement('div');
  pathContainer.className = 'autk-provenance-path';
  pathContainer.setAttribute('role', 'list');
  container.appendChild(pathContainer);
  return pathContainer;
}

export function createNavButtons(
  container: HTMLElement,
  onBack: () => void,
  onForward: () => void
): { backBtn: HTMLButtonElement; fwdBtn: HTMLButtonElement } {
  const btnRow = document.createElement('div');
  btnRow.className = 'autk-provenance-buttons';
  const backBtn = document.createElement('button');
  backBtn.textContent = '\u2190 Back';
  backBtn.setAttribute('aria-label', 'Go back one step');
  const fwdBtn = document.createElement('button');
  fwdBtn.textContent = 'Forward \u2192';
  fwdBtn.setAttribute('aria-label', 'Go forward one step');
  backBtn.addEventListener('click', onBack);
  fwdBtn.addEventListener('click', onForward);
  btnRow.appendChild(backBtn);
  btnRow.appendChild(fwdBtn);
  container.appendChild(btnRow);
  return { backBtn, fwdBtn };
}

export function createInsightsSection(container: HTMLElement): InsightsSectionElements {
  const wrap = document.createElement('div');
  wrap.className = 'autk-prov-insights-wrap';

  const header = document.createElement('div');
  header.className = 'autk-prov-insights-header';
  const headerLabel = document.createElement('span');
  headerLabel.className = 'autk-prov-insights-header-label';
  headerLabel.textContent = 'Session Insights';
  const chevron = document.createElement('span');
  chevron.className = 'autk-prov-insights-chevron';
  chevron.textContent = '\u25b4';
  header.appendChild(headerLabel);
  header.appendChild(chevron);

  const body = document.createElement('div');
  body.className = 'autk-prov-insights-body';

  wrap.appendChild(header);
  wrap.appendChild(body);
  container.appendChild(wrap);

  return { wrap, body, chevron };
}
