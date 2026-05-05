export interface GraphToolbarElements {
  toolbar: HTMLDivElement;
  toggleButton: HTMLButtonElement;
  expandButton: HTMLButtonElement;
  hint: HTMLSpanElement;
}

export interface NavigationButtons {
  row: HTMLDivElement;
  backButton: HTMLButtonElement;
  forwardButton: HTMLButtonElement;
}

export function createGraphToolbar(): GraphToolbarElements {
  const toolbar = document.createElement('div');
  const main = document.createElement('div');
  const toggleButton = document.createElement('button');
  const expandButton = document.createElement('button');
  const hint = document.createElement('span');

  toolbar.className = 'autk-provenance-toolbar';
  main.className = 'autk-provenance-toolbar-main';
  toggleButton.className = 'autk-provenance-toggle';
  expandButton.className = 'autk-provenance-toggle';
  hint.className = 'autk-provenance-toolbar-hint';

  main.appendChild(toggleButton);
  main.appendChild(expandButton);
  toolbar.appendChild(main);
  toolbar.appendChild(hint);

  return { toolbar, toggleButton, expandButton, hint };
}

export function createNavigationButtons(): NavigationButtons {
  const row = document.createElement('div');
  const backButton = document.createElement('button');
  const forwardButton = document.createElement('button');
  row.className = 'autk-provenance-buttons';
  backButton.textContent = '\u2190 Back';
  backButton.setAttribute('aria-label', 'Go back one step');
  forwardButton.textContent = 'Forward \u2192';
  forwardButton.setAttribute('aria-label', 'Go forward one step');
  row.appendChild(backButton);
  row.appendChild(forwardButton);
  return { row, backButton, forwardButton };
}

export function createInsightsShell(parent: HTMLElement): {
  body: HTMLDivElement;
  setOpen(open: boolean): void;
  isOpen(): boolean;
} {
  const wrap = document.createElement('div');
  const header = document.createElement('div');
  const label = document.createElement('span');
  const chevron = document.createElement('span');
  const body = document.createElement('div');
  let open = true;

  wrap.className = 'autk-prov-insights-wrap';
  header.className = 'autk-prov-insights-header';
  label.className = 'autk-prov-insights-header-label';
  chevron.className = 'autk-prov-insights-chevron';
  body.className = 'autk-prov-insights-body';
  label.textContent = 'Session Insights';
  chevron.textContent = '\u25b4';
  header.appendChild(label);
  header.appendChild(chevron);
  wrap.appendChild(header);
  wrap.appendChild(body);
  parent.appendChild(wrap);

  header.addEventListener('click', () => {
    open = !open;
    body.style.display = open ? 'flex' : 'none';
    chevron.textContent = open ? '\u25b4' : '\u25be';
  });

  return {
    body,
    setOpen: (value) => {
      open = value;
      body.style.display = open ? 'flex' : 'none';
      chevron.textContent = open ? '\u25b4' : '\u25be';
    },
    isOpen: () => open,
  };
}
