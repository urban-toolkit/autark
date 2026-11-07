import { describe, expect, it } from 'vitest';
import { TILE_SOURCES, expandTileUrl, resolveTileSource, tileSourceId } from '../src/tile-source';
import type { TileSource } from '../src/tile-source';

const OSM: TileSource = {
  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '© OpenStreetMap contributors',
};

describe('resolveTileSource', () => {
  it('applies defaults', () => {
    expect(resolveTileSource(OSM)).toEqual({
      urlTemplate: OSM.urlTemplate,
      attribution: [{ text: '© OpenStreetMap contributors' }],
      minZoom: 0,
      maxZoom: 19,
      tileSize: 256,
      subdomains: [],
    });
  });

  it('keeps explicit options and splits a subdomain string', () => {
    const resolved = resolveTileSource({
      urlTemplate: 'https://{s}.example.org/{z}/{x}/{y}.png',
      attribution: 'x',
      minZoom: 2,
      maxZoom: 14,
      tileSize: 512,
      subdomains: 'abc',
    });
    expect(resolved).toMatchObject({ minZoom: 2, maxZoom: 14, tileSize: 512, subdomains: ['a', 'b', 'c'] });
    expect(resolveTileSource({ ...OSM, urlTemplate: 'https://{s}.e.org/{z}/{x}/{y}', subdomains: ['one', 'two'] }).subdomains)
      .toEqual(['one', 'two']);
  });

  it.each([
    ['an empty template', { ...OSM, urlTemplate: '' }, /needs a urlTemplate/],
    ['an unknown placeholder', { ...OSM, urlTemplate: 'https://e.org/{z}/{x}/{y}/{q}' }, /unknown placeholder \{q\}/],
    ['no {z}', { ...OSM, urlTemplate: 'https://e.org/{x}/{y}' }, /\{z\} and \{x\}/],
    ['no {x}', { ...OSM, urlTemplate: 'https://e.org/{z}/{y}' }, /\{z\} and \{x\}/],
    ['no {y} or {reverseY}', { ...OSM, urlTemplate: 'https://e.org/{z}/{x}' }, /\{y\} or \{reverseY\}/],
    ['both {y} and {reverseY}', { ...OSM, urlTemplate: 'https://e.org/{z}/{x}/{y}/{reverseY}' }, /both/],
    ['no attribution', { ...OSM, attribution: '' }, /attribution/],
    ['a blank attribution', { ...OSM, attribution: '   ' }, /attribution/],
    ['an empty attribution list', { ...OSM, attribution: [] }, /attribution/],
    ['an attribution entry without text', { ...OSM, attribution: [{ text: ' ', url: 'https://e.org' }] }, /attribution/],
    ['an attribution link that is not http(s)', { ...OSM, attribution: { text: 'x', url: 'javascript:alert(1)' } }, /http or https/],
    ['an attribution link that is not a URL', { ...OSM, attribution: { text: 'x', url: 'not a url' } }, /http or https/],
    ['a fractional zoom', { ...OSM, maxZoom: 3.5 }, /maxZoom must be an integer/],
    ['a negative zoom', { ...OSM, minZoom: -1 }, /minZoom must be an integer/],
    ['zoom limits out of order', { ...OSM, minZoom: 8, maxZoom: 4 }, /greater than maxZoom/],
    ['a zero tile size', { ...OSM, tileSize: 0 }, /tileSize/],
    ['{s} without subdomains', { ...OSM, urlTemplate: 'https://{s}.e.org/{z}/{x}/{y}' }, /no subdomains/],
  ] as Array<[string, TileSource, RegExp]>)('rejects %s', (_label, source, message) => {
    expect(() => resolveTileSource(source)).toThrow(message);
  });
});

describe('attribution forms', () => {
  it('accepts a string, an entry with a link, or a list of either', () => {
    expect(resolveTileSource({ ...OSM, attribution: ' © A ' }).attribution).toEqual([{ text: '© A' }]);
    expect(resolveTileSource({ ...OSM, attribution: { text: '© A', url: 'https://a.example/legal' } }).attribution)
      .toEqual([{ text: '© A', url: 'https://a.example/legal' }]);
    expect(resolveTileSource({ ...OSM, attribution: ['© A', { text: '© B', url: 'http://b.example' }] }).attribution)
      .toEqual([{ text: '© A' }, { text: '© B', url: 'http://b.example' }]);
  });

  it('gives the OpenStreetMap-based presets a link to the OSM copyright page', () => {
    for (const preset of [TILE_SOURCES.openStreetMap, TILE_SOURCES.cartoLight]) {
      const credits = resolveTileSource(preset).attribution;
      expect(credits.some((c) => c.text.includes('OpenStreetMap') && c.url === 'https://www.openstreetmap.org/copyright')).toBe(true);
    }
  });

  it('keeps every preset valid', () => {
    for (const preset of Object.values(TILE_SOURCES)) expect(() => resolveTileSource(preset)).not.toThrow();
  });
});

describe('expandTileUrl', () => {
  it('fills z, x and y', () => {
    expect(expandTileUrl(resolveTileSource(OSM), { z: 17, x: 66500, y: 63177 }))
      .toBe('https://tile.openstreetmap.org/17/66500/63177.png');
  });

  it('follows the order of the template (Esri puts y before x)', () => {
    expect(expandTileUrl(resolveTileSource(TILE_SOURCES.esriWorldImagery), { z: 17, x: 66500, y: 63177 }))
      .toBe('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/17/63177/66500');
  });

  it('counts rows from the south for {reverseY}', () => {
    const source = resolveTileSource({ ...OSM, urlTemplate: 'https://e.org/{z}/{x}/{reverseY}.png' });
    expect(expandTileUrl(source, { z: 3, x: 2, y: 0 })).toBe('https://e.org/3/2/7.png');
    expect(expandTileUrl(source, { z: 3, x: 2, y: 7 })).toBe('https://e.org/3/2/0.png');
  });

  it('always sends a tile to the same subdomain, and spreads neighbours across them', () => {
    const source = resolveTileSource(TILE_SOURCES.cartoLight);
    const tile = { z: 10, x: 5, y: 7 };
    expect(expandTileUrl(source, tile)).toBe(expandTileUrl(source, tile));
    const hosts = new Set<string>();
    for (let x = 0; x < 4; x++) hosts.add(new URL(expandTileUrl(source, { z: 10, x, y: 0 })).host);
    expect(hosts.size).toBe(4);
  });

  it('rejects tiles outside the grid', () => {
    expect(() => expandTileUrl(resolveTileSource(OSM), { z: 2, x: 4, y: 0 })).toThrow(/Invalid tile/);
  });
});

describe('tileSourceId', () => {
  it('is shared by sources with the same template and tile size', () => {
    expect(tileSourceId(resolveTileSource(OSM))).toBe(tileSourceId(resolveTileSource({ ...OSM, attribution: 'other' })));
    expect(tileSourceId(resolveTileSource(OSM))).not.toBe(tileSourceId(resolveTileSource({ ...OSM, tileSize: 512 })));
  });
});

describe('TILE_SOURCES', () => {
  it.each(Object.entries(TILE_SOURCES))('%s is a valid source', (_name, source) => {
    expect(() => resolveTileSource(source as TileSource)).not.toThrow();
  });
});
