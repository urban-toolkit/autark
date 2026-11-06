// Shared, dependency-free navigation and appearance for the tutorial pages.
const main = document.querySelector('main');
if (main) { main.id = 'main-content'; main.tabIndex = -1; }
document.body.dataset.page = location.pathname.split('/').pop() || 'index.html';
const header = document.createElement('header');
header.className = 'site-header';
header.innerHTML = `
  <a class="skip-link" href="#${main ? 'main-content' : 'app'}">Skip to content</a>
  <div class="site-header-inner">
    <a class="site-brand" href="index.html" aria-label="Autark tutorial overview">
      <img class="logo-light" src="assets/logo.svg" width="26" height="32" alt="">
      <img class="logo-dark" src="assets/logo-dark.svg" width="26" height="32" alt="">
      <span>Autark</span>
    </a>
    <a class="site-section" href="index.html">Tutorial</a>
    <button class="theme-toggle" type="button" aria-label="Switch to dark theme" aria-pressed="false">
      <svg class="icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M20.8 13A9 9 0 0 1 11 3.2 9 9 0 1 0 20.8 13Z"/></svg>
      <svg class="icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>
    </button>
  </div>`;
document.body.prepend(header);

const themeButton = header.querySelector('.theme-toggle');
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
let theme;
try { theme = localStorage.getItem('autark-tutorial:theme'); } catch { /* Storage is optional. */ }
const updateTheme = () => {
  const dark = theme === 'dark' || (theme !== 'light' && systemTheme.matches);
  document.documentElement.classList.toggle('dark', dark);
  themeButton.setAttribute('aria-pressed', String(dark));
  themeButton.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} theme`);
};
updateTheme();
systemTheme.addEventListener('change', updateTheme);
themeButton.addEventListener('click', () => {
  theme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
  try { localStorage.setItem('autark-tutorial:theme', theme); } catch { /* Storage is optional. */ }
  updateTheme();
});

const toc = document.querySelector('nav.toc');
if (toc) {
  toc.setAttribute('aria-label', 'Tutorial navigation');
  const chapters = document.querySelector('.series-nav');
  const label = document.createElement('div');
  label.className = 'toc-title';
  label.textContent = 'Learn Autark';
  chapters.querySelector('span').setAttribute('aria-current', 'page');

  const outline = document.createElement('details');
  outline.className = 'page-outline';
  const summary = document.createElement('summary');
  summary.textContent = 'On this page';
  outline.append(summary, toc.querySelector('ol'));
  toc.replaceChildren(label, chapters, outline);
  const narrow = matchMedia('(max-width: 860px)');
  outline.open = !narrow.matches;
  narrow.addEventListener('change', () => { outline.open = !narrow.matches; });

  const links = [...outline.querySelectorAll('a[href^="#"]')];
  const byId = new Map(links.map(link => [link.hash.slice(1), link]));
  const spy = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      links.forEach(link => { link.classList.remove('active'); link.removeAttribute('aria-current'); });
      const active = byId.get(entry.target.id);
      active?.classList.add('active');
      active?.setAttribute('aria-current', 'location');
    }
  }, { rootMargin: '-15% 0px -70% 0px' });
  document.querySelectorAll('main section[id]').forEach(section => spy.observe(section));
}
