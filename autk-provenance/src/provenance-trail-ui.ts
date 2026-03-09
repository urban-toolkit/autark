import type { AutarkProvenanceState } from './types';
import type { PathNode } from './types';
import type { AutarkProvenanceApi } from './create-autark-provenance';

export interface ProvenanceTrailUIOptions {
  provenance: AutarkProvenanceApi;
  container: HTMLElement;
  showBackForward?: boolean;
  showTimestamps?: boolean;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function renderProvenanceTrailUI(options: ProvenanceTrailUIOptions): () => void {
  const {
    provenance,
    container,
    showBackForward = true,
    showTimestamps = true,
  } = options;

  if (typeof document !== 'undefined' && document.head) {
    const styleId = 'autk-provenance-trail-styles';
    if (!document.getElementById(styleId)) {
      const el = document.createElement('style');
      el.id = styleId;
      el.textContent = '.autk-provenance-trail{font-family:system-ui,sans-serif;font-size:13px;padding:8px}.autk-provenance-trail-path{display:flex;flex-direction:column;gap:2px;max-height:280px;overflow-y:auto}.autk-provenance-trail-item{display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer;border-radius:4px;border:1px solid transparent}.autk-provenance-trail-item:hover{background:rgba(0,0,0,.06)}.autk-provenance-trail-item.autk-provenance-trail-current{background:rgba(0,0,0,.08);border-color:rgba(0,0,0,.15);font-weight:600}.autk-provenance-trail-label{flex:1}.autk-provenance-trail-time{color:#666;font-size:11px}.autk-provenance-trail-buttons{display:flex;gap:6px;margin-top:8px}.autk-provenance-trail-buttons button{padding:6px 12px;cursor:pointer}.autk-provenance-trail-buttons button:disabled{opacity:.5;cursor:not-allowed}';
      document.head.appendChild(el);
    }
  }
  container.classList.add('autk-provenance-trail');
  container.innerHTML = '';

  const pathContainer = document.createElement('div');
  pathContainer.className = 'autk-provenance-trail-path';
  pathContainer.setAttribute('role', 'list');
  container.appendChild(pathContainer);

  let backBtn: HTMLButtonElement | null = null;
  let fwdBtn: HTMLButtonElement | null = null;

  if (showBackForward) {
    const btnRow = document.createElement('div');
    btnRow.className = 'autk-provenance-trail-buttons';
    backBtn = document.createElement('button');
    backBtn.textContent = '← Back';
    backBtn.setAttribute('aria-label', 'Go back one step');
    fwdBtn = document.createElement('button');
    fwdBtn.textContent = 'Forward →';
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

  function updateButtons(): void {
    if (backBtn) backBtn.disabled = !provenance.canGoBack();
    if (fwdBtn) fwdBtn.disabled = !provenance.canGoForward();
  }

  function renderPath(path: PathNode<AutarkProvenanceState>[]): void {
    pathContainer.innerHTML = '';
    const currentId = provenance.getCurrentNode()?.id ?? null;

    for (let i = 0; i < path.length; i++) {
      const node = path[i];
      const isCurrent = node.id === currentId;
      const item = document.createElement('div');
      item.className = 'autk-provenance-trail-item' + (isCurrent ? ' autk-provenance-trail-current' : '');
      item.setAttribute('role', 'listitem');
      item.setAttribute('data-node-id', node.id);

      const labelSpan = document.createElement('span');
      labelSpan.className = 'autk-provenance-trail-label';
      labelSpan.textContent = node.actionLabel;
      if (isCurrent) {
        labelSpan.setAttribute('aria-current', 'step');
      }
      item.appendChild(labelSpan);

      if (showTimestamps) {
        const timeSpan = document.createElement('span');
        timeSpan.className = 'autk-provenance-trail-time';
        timeSpan.textContent = formatTime(node.timestamp);
        item.appendChild(timeSpan);
      }

      item.addEventListener('click', () => {
        provenance.goToNode(node.id);
      });

      pathContainer.appendChild(item);
    }

    updateButtons();
  }

  function refresh(): void {
    const path = provenance.getPathFromRoot();
    renderPath(path);
  }

  const unsub = provenance.addObserver(() => {
    refresh();
  });

  refresh();

  return () => {
    unsub();
    container.innerHTML = '';
    container.classList.remove('autk-provenance-trail');
  };
}
