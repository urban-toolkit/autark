import * as fs from 'fs';
import * as path from 'path';
import { Page } from '@playwright/test';

const OVERPASS_INTERPRETER_PATTERN = 'https://overpass-api.de/api/interpreter';
const OVERPASS_STATUS_PATTERN = 'https://overpass-api.de/api/status';
// Satisfies autk-db's slot-availability check without hitting the network during playback.
const OVERPASS_STATUS_MOCK = 'Connected as anonymous\nCurrent time: 2026-01-01T00:00:00Z\nRate limit: 2\n2 slots available now.';
interface HarHeader { name: string; value: string; }

interface HarEntry {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    httpVersion: string;
    cookies: [];
    headers: HarHeader[];
    queryString: [];
    headersSize: number;
    bodySize: number;
    postData?: { mimeType: string; text: string };
  };
  response: {
    status: number;
    statusText: string;
    httpVersion: string;
    cookies: [];
    headers: HarHeader[];
    headersSize: number;
    bodySize: number;
    redirectURL: string;
    content: { size: number; mimeType: string; text: string };
  };
  cache: Record<string, never>;
  timings: { send: number; wait: number; receive: number };
}

/**
 * Routes Overpass API interpreter requests through a HAR file.
 *
 * - update: false — playback mode, delegates to page.routeFromHAR().
 * - update: true  — recording mode: passes requests through to the network and
 *   records only successful (2xx) responses. Retries are handled by the use case.
 */
export async function routeOverpassHar(page: Page, harPath: string, update: boolean): Promise<void> {
  const shouldUpdate = update || process.env['HAR_UPDATE'] === '1';
  if (!shouldUpdate) {
    await page.route(OVERPASS_STATUS_PATTERN, route =>
      route.fulfill({ status: 200, contentType: 'text/plain', body: OVERPASS_STATUS_MOCK }),
    );
    await page.routeFromHAR(harPath, { url: OVERPASS_INTERPRETER_PATTERN, update: false });
    return;
  }

  const entries: HarEntry[] = [];

  await page.route(OVERPASS_INTERPRETER_PATTERN, async (route) => {
    const request = route.request();
    const startedDateTime = new Date().toISOString();
    const t0 = Date.now();
    const response = await route.fetch();
    const elapsed = Date.now() - t0;

    if (response.ok()) {
      const body = await response.text();
      const mimeType = response.headers()['content-type'] ?? 'application/json';
      const postData = request.postData();

      entries.push({
        startedDateTime,
        time: elapsed,
        request: {
          method: request.method(),
          url: request.url(),
          httpVersion: 'HTTP/1.1',
          cookies: [],
          headers: Object.entries(request.headers()).map(([name, value]) => ({ name, value })),
          queryString: [],
          headersSize: -1,
          bodySize: -1,
          ...(postData ? { postData: { mimeType: 'application/x-www-form-urlencoded', text: postData } } : {}),
        },
        response: {
          status: response.status(),
          statusText: response.statusText(),
          httpVersion: 'HTTP/1.1',
          cookies: [],
          headers: Object.entries(response.headers()).map(([name, value]) => ({ name, value })),
          headersSize: -1,
          bodySize: -1,
          redirectURL: '',
          content: { size: body.length, mimeType, text: body },
        },
        cache: {},
        timings: { send: -1, wait: -1, receive: elapsed },
      });
    }

    await route.fulfill({ response });
  });

  page.on('close', () => {
    const har = { log: { version: '1.2', creator: { name: 'autk-tests', version: '1.0' }, entries } };
    fs.mkdirSync(path.dirname(harPath), { recursive: true });
    fs.writeFileSync(harPath, JSON.stringify(har, null, 2));
    console.log(`[har-recorder] Saved ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} to ${harPath}`);
  });
}
