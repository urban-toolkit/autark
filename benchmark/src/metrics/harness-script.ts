export const CLIENT_HARNESS_SCRIPT = `
(function() {
  if (window.__AUTK_HARNESS_INSTALLED__) return;
  window.__AUTK_HARNESS_INSTALLED__ = true;

  const metrics = {
    navStart: performance.now(),
    domContentLoaded: 0,
    firstDataFetchStart: 0,
    lastDataFetchEnd: 0,
    dataFetchCount: 0,
    totalFetchBytes: 0,
    dbInitStart: 0,
    dbInitEnd: 0,
    triangulationStart: 0,
    triangulationEnd: 0,
    firstDrawStart: 0,
    firstDrawEnd: 0,
    totalDrawCalls: 0,
    viewReadyTimestamp: 0,
    errors: [],
  };

  window.__AUTK_RAW_METRICS__ = metrics;

  function initObserver() {
    const target = document.documentElement || document.body || document;
    if (!target) return;
    const observer = new MutationObserver(function() {
      const overlay = document.getElementById('loading-overlay') || document.querySelector('.loading-overlay');
      if (overlay && (overlay.classList.contains('hidden') || overlay.style.display === 'none')) {
        if (!metrics.viewReadyTimestamp) {
          metrics.viewReadyTimestamp = performance.now();
        }
      }
    });
    observer.observe(target, { attributes: true, subtree: true, childList: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      metrics.domContentLoaded = performance.now();
      initObserver();
    });
  } else {
    metrics.domContentLoaded = performance.now();
    initObserver();
  }

  // Track Uncaught Errors
  window.addEventListener('error', function(e) {
    if (e.message) metrics.errors.push(e.message);
  });
  window.addEventListener('unhandledrejection', function(e) {
    const msg = e.reason ? (e.reason.message || String(e.reason)) : 'Unhandled rejection';
    metrics.errors.push(msg);
  });

  // Intercept fetch to track data transfer
  const origFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = String(args[0]);
    const isData = url.includes('/data/') || url.includes('interpreter') || url.includes('.geojson') || url.includes('.csv') || url.includes('.tif');
    const start = performance.now();
    if (isData) {
      if (!metrics.firstDataFetchStart) metrics.firstDataFetchStart = start;
      metrics.dataFetchCount++;
    }
    try {
      const response = await origFetch.apply(this, args);
      if (isData) {
        metrics.lastDataFetchEnd = performance.now();
        const clone = response.clone();
        clone.arrayBuffer().then(buf => {
          metrics.totalFetchBytes += buf.byteLength;
        }).catch(() => {});
      }
      return response;
    } catch (err) {
      if (isData) metrics.lastDataFetchEnd = performance.now();
      throw err;
    }
  };

  // Intercept GPU queue submit / draw
  if (typeof GPUQueue !== 'undefined' && GPUQueue.prototype.submit) {
    const origSubmit = GPUQueue.prototype.submit;
    GPUQueue.prototype.submit = function(...args) {
      if (!metrics.firstDrawStart) metrics.firstDrawStart = performance.now();
      metrics.totalDrawCalls++;
      const res = origSubmit.apply(this, args);
      metrics.firstDrawEnd = performance.now();
      return res;
    };
  }

  window.__AUTK_MARK_READY__ = function() {
    if (!metrics.viewReadyTimestamp) {
      metrics.viewReadyTimestamp = performance.now();
    }
  };

  window.__AUTK_GET_METRICS__ = function() {
    if (!metrics.domContentLoaded) metrics.domContentLoaded = performance.now();
    if (!metrics.viewReadyTimestamp) {
      const canvas = document.querySelector('canvas');
      const plot = document.querySelector('svg');
      if (canvas || plot) {
        metrics.viewReadyTimestamp = performance.now();
      }
    }
    return metrics;
  };
})();
`;
