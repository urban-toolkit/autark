import { describe, expect, it } from 'vitest';
import {
  EARTH_RADIUS,
  WEB_MERCATOR_EXTENT,
  WEB_MERCATOR_MAX_LAT,
  clampLatitude,
  crsToLonLat,
  isTileCrs,
  latToMercatorY,
  lonLatToCrs,
  mercatorYToLat,
} from '../src/tile-projection';

/** [lon, lat, x3395, y3395, y3857] computed by PROJ through `gdaltransform`; x is the same in both systems. */
const REFERENCE: Array<[number, number, number, number, number]> = [
  [0, 0, 0, 0, 0],
  [2.65, 6.46, 294996.650602175, 715848.343756614, 720652.375068224],
  [-74.0, 40.7, -8237642.31870224, 4940322.38075688, 4968191.93018821],
  [151.2, -33.8, 16831507.007943, -3978209.47251257, -4001978.42355684],
  [10, 60, 1113194.90793274, 8362698.54850075, 8399737.88981836],
  [-122.4, 37.8, -13625505.6730967, 4525019.24475892, 4551210.91969189],
  [180, 85.0511287798066, 20037508.3427892, 19994875.249796, 20037508.3427892],
];

describe('lonLatToCrs', () => {
  it.each(REFERENCE)('matches PROJ at %f, %f', (lon, lat, x, y3395, y3857) => {
    const [mx, my] = lonLatToCrs('EPSG:3395', lon, lat);
    expect(mx).toBeCloseTo(x, 3);
    expect(my).toBeCloseTo(y3395, 3);

    const [sx, sy] = lonLatToCrs('EPSG:3857', lon, lat);
    expect(sx).toBeCloseTo(x, 3);
    expect(sy).toBeCloseTo(y3857, 3);
  });

  it('keeps degrees for EPSG:4326', () => {
    expect(lonLatToCrs('EPSG:4326', 12.5, -7.25)).toEqual([12.5, -7.25]);
  });

  it('limits Mercator latitudes to the Web Mercator square', () => {
    expect(lonLatToCrs('EPSG:3857', 0, 89.9)[1]).toBeCloseTo(WEB_MERCATOR_EXTENT, 3);
    expect(lonLatToCrs('EPSG:3395', 0, -89.9)[1]).toBeCloseTo(lonLatToCrs('EPSG:3395', 0, -WEB_MERCATOR_MAX_LAT)[1], 6);
  });

  it('puts 3395 and 3857 several kilometres apart at tropical latitudes', () => {
    const [, y3395] = lonLatToCrs('EPSG:3395', 0, 6.5);
    const [, y3857] = lonLatToCrs('EPSG:3857', 0, 6.5);
    expect(y3857 - y3395).toBeGreaterThan(4800);
    expect(y3857 - y3395).toBeLessThan(4900);
  });
});

describe('crsToLonLat', () => {
  it.each(['EPSG:3395', 'EPSG:3857', 'EPSG:4326'] as const)('inverts lonLatToCrs in %s', (crs) => {
    for (const lat of [-80, -45.5, -6.46, 0, 6.46, 33.3, 60, 84]) {
      for (const lon of [-179.5, -74, 0, 2.65, 151.2, 179.5]) {
        const [x, y] = lonLatToCrs(crs, lon, lat);
        const [lon2, lat2] = crsToLonLat(crs, x, y);
        expect(lon2).toBeCloseTo(lon, 9);
        expect(lat2).toBeCloseTo(lat, 9);
      }
    }
  });
});

describe('Mercator helpers', () => {
  it('maps the edge of the square to ±extent and back', () => {
    expect(latToMercatorY(WEB_MERCATOR_MAX_LAT)).toBeCloseTo(WEB_MERCATOR_EXTENT, 3);
    expect(mercatorYToLat(WEB_MERCATOR_EXTENT)).toBeCloseTo(WEB_MERCATOR_MAX_LAT, 9);
    expect(WEB_MERCATOR_EXTENT).toBeCloseTo(Math.PI * EARTH_RADIUS, 6);
  });

  it('clamps latitudes', () => {
    expect(clampLatitude(90)).toBe(WEB_MERCATOR_MAX_LAT);
    expect(clampLatitude(-90)).toBe(-WEB_MERCATOR_MAX_LAT);
    expect(clampLatitude(12)).toBe(12);
  });

  it('recognizes the supported coordinate systems', () => {
    expect(isTileCrs('EPSG:3395')).toBe(true);
    expect(isTileCrs('EPSG:3857')).toBe(true);
    expect(isTileCrs('EPSG:4326')).toBe(true);
    expect(isTileCrs('EPSG:32631')).toBe(false);
    expect(isTileCrs(undefined)).toBe(false);
  });
});
