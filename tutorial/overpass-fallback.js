// Overpass with a browser cache and a bundled fallback.
//
// The cells that load OpenStreetMap data (autk-db's loadOsm, and one direct fetch) ask the public
// Overpass server at overpass-api.de, which is often busy or down. withFallback(fn) runs fn with
// window.fetch wrapped so that, for each request to Overpass:
//   1. an answer cached in this browser (Cache API, 7 days) is used if there is one;
//   2. otherwise the server is checked (4 s) and, if it answers, the request is tried live (15 s) and a
//      successful answer is cached;
//   3. if the server is unreachable, or the request fails (timeout, any HTTP error), the answer recorded
//      for the same query in data/osm/ is used instead, and the rest of fn stays offline;
//   4. /api/status (which autk-db polls, and may wait on for minutes) never blocks.
// Recordings are keyed by a hash of the query text without its [timeout:N] setting, which autk-db
// changes between retries. Recording provenance is in data/osm/manifest.json.
//
// URL switches, for any page:  ?overpass=offline   use only the bundled data, never contact Overpass
//                              ?overpass=down      pretend the server is unreachable (to see the fallback)

const ENDPOINT = "https://overpass-api.de/api/";
const LIVE_TIMEOUT_MS = 15000;
const PROBE_TIMEOUT_MS = 4000;
const CACHE_NAME = "autark-tutorial-overpass-v1";
const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;
// Use a file as the base: Vite normalizes directory asset URLs and drops their trailing slash.
const RECORDINGS = new URL("./data/osm/manifest.json", import.meta.url);

// The query text a request carries: autk-db sends "data=<urlencoded query>", a plain fetch may send either.
export function queryOf(body) {
  const text = String(body ?? "");
  return text.startsWith("data=") ? decodeURIComponent(text.slice(5).replace(/\+/g, " ")) : text;
}

export const isXml = query => /\[out:xml\]/.test(query);

// Stable id of a query: sha-256 of the query without [timeout:N] and with whitespace collapsed.
export async function queryKey(query) {
  const normal = query.replace(/\[timeout:\d+\]/g, "[timeout:0]").replace(/\s+/g, " ").trim();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normal));
  return [...new Uint8Array(digest)].slice(0, 8).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Answers from the live server are kept in the Cache API, keyed by query. Storage can be unavailable
// (private windows, blocked site data), so every access is guarded.
const cacheRequest = key => new Request(`https://overpass.cache/${key}`);
async function cacheGet(key) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(cacheRequest(key));
    if (!hit) return null;
    if (Date.now() - Number(hit.headers.get("x-cached-at")) > CACHE_TTL_MS) { await cache.delete(cacheRequest(key)); return null; }
    return hit;
  } catch { return null; }
}
async function cachePut(key, response) {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(cacheRequest(key), new Response(await response.blob(), {headers: {"x-cached-at": String(Date.now())}}));
  } catch { /* Cache storage may be unavailable or full. */ }
}

export async function withFallback(fn, {note = () => {}} = {}) {
  const mode = new URLSearchParams(globalThis.location?.search ?? "").get("overpass") || "";
  const originalFetch = window.fetch;
  const realFetch = originalFetch.bind(window);
  let useBundled = mode === "offline";
  let probed = mode === "down" || mode === "offline";   // `down` simulates a failed check
  let announced = false;
  const announce = reason => {
    if (announced) return;
    announced = true;
    note(`Overpass is not answering (${reason}); using the copy recorded in data/osm/ instead.`);
  };
  if (useBundled) note("Using the copy of the OpenStreetMap data recorded in data/osm/ (?overpass=offline).");

  window.fetch = async (input, init = {}) => {
    const url = input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
    if (!url.startsWith(ENDPOINT)) return realFetch(input, init);

    // autk-db waits here while Overpass reports no free slots; never let that hold a cell up.
    if (url.startsWith(ENDPOINT + "status")) return new Response("1 slots available now\n");

    const query = queryOf(init.body);
    const key = await queryKey(query);
    let reason = "offline mode";
    if (!useBundled && mode !== "down") {
      const cached = await cacheGet(key);
      if (cached) return cached;
    }
    if (!useBundled && !probed) {
      // Is the server reachable at all? Any HTTP answer counts; only a network error or silence does not.
      probed = true;
      try { await realFetch(ENDPOINT + "status", {signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)}); }
      catch { useBundled = true; reason = "server not reachable"; announce(reason); }
    }
    if (mode === "down" && !useBundled) { useBundled = true; reason = "simulated failure (?overpass=down)"; announce(reason); }
    if (!useBundled) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), LIVE_TIMEOUT_MS);
      try {
        const response = await realFetch(input, {...init, signal: controller.signal});
        if (response.ok) { cachePut(key, response.clone()); return response; }
        reason = `HTTP ${response.status}`;
      } catch (e) {
        reason = e.name === "AbortError" ? `no answer in ${LIVE_TIMEOUT_MS / 1000} s` : "network error";
      } finally {
        clearTimeout(timer);
      }
      useBundled = true;           // stay offline for the rest of this cell
      announce(reason);
    }
    const saved = await realFetch(new URL(`${key}.${isXml(query) ? "xml" : "json"}.gz`, RECORDINGS).href).catch(() => null);
    if (!saved?.ok) throw new Error(`Overpass is unavailable (${reason}) and no recording exists for this query (${key}). Edited queries need the live server.`);
    // Vite serves .gz assets with Content-Encoding: gzip, which fetch already decodes.
    const body = saved.headers.get("Content-Encoding") === "gzip"
      ? saved.body
      : saved.body.pipeThrough(new DecompressionStream("gzip"));
    return new Response(body, {status: 200});
  };
  try { return await fn(); }
  finally { window.fetch = originalFetch; }
}
