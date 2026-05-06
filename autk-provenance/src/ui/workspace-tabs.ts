export function bindWorkspaceTabs(root: HTMLElement): () => void {
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('.autk-workspace-tab'));
  const panels = Array.from(root.querySelectorAll<HTMLElement>('.autk-workspace-tab-content'));
  const chartsOnly = Array.from(root.querySelectorAll<HTMLElement>('[data-charts-only="true"]'));

  const handleClick = (button: HTMLButtonElement) => {
    const tab = button.dataset.tab;
    tabs.forEach((item) => item.classList.toggle('active', item === button));
    panels.forEach((panel) => panel.classList.toggle('autk-workspace-hidden', panel.dataset.panel !== tab));
    chartsOnly.forEach((panel) => panel.classList.toggle('autk-workspace-hidden', tab !== 'charts'));
  };

  tabs.forEach((button) => {
    const listener = () => handleClick(button);
    button.addEventListener('click', listener);
  });

  return () => {
    tabs.forEach((button) => {
      button.replaceWith(button.cloneNode(true));
    });
  };
}
