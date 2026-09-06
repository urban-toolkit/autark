import { DeterministicRandom } from './prng';

export type FootprintShape = 'rectangle' | 'l-shape' | 'u-shape' | 't-shape' | 'setback';

/**
 * Procedural SpiderWeb polygon footprint generator.
 * Produces realistic non-convex geometries (L-shapes, U-shapes, setbacks, multi-vertex perimeter loops).
 */
export function generateSpiderwebFootprint(
  originLon: number,
  originLat: number,
  width: number,
  height: number,
  shape: FootprintShape = 'l-shape',
): number[][] {
  const x0 = originLon;
  const y0 = originLat;
  const x1 = originLon + width;
  const y1 = originLat + height;

  if (shape === 'l-shape') {
    const cutX = x0 + width * 0.45;
    const cutY = y0 + height * 0.55;
    return [
      [x0, y0],
      [x1, y0],
      [x1, cutY],
      [cutX, cutY],
      [cutX, y1],
      [x0, y1],
      [x0, y0],
    ];
  }

  if (shape === 'u-shape') {
    const leftX = x0 + width * 0.3;
    const rightX = x0 + width * 0.7;
    const notchY = y0 + height * 0.6;
    return [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [rightX, y1],
      [rightX, notchY],
      [leftX, notchY],
      [leftX, y1],
      [x0, y1],
      [x0, y0],
    ];
  }

  if (shape === 't-shape') {
    const stemLeft = x0 + width * 0.35;
    const stemRight = x0 + width * 0.65;
    const barBottom = y0 + height * 0.6;
    return [
      [stemLeft, y0],
      [stemRight, y0],
      [stemRight, barBottom],
      [x1, barBottom],
      [x1, y1],
      [x0, y1],
      [x0, barBottom],
      [stemLeft, barBottom],
      [stemLeft, y0],
    ];
  }

  if (shape === 'setback') {
    const sbX = width * 0.15;
    return [
      [x0, y0],
      [x1, y0],
      [x1, y0 + height * 0.5],
      [x1 - sbX, y0 + height * 0.5],
      [x1 - sbX, y1],
      [x0 + sbX, y1],
      [x0 + sbX, y0 + height * 0.5],
      [x0, y0 + height * 0.5],
      [x0, y0],
    ];
  }

  // Fallback: Rectangle
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0],
  ];
}

/**
 * Samples building heights from a log-normal distribution to replicate real-world skews.
 */
export function sampleSpiderwebBuildingHeight(
  rng: DeterministicRandom,
  medianHeight: number = 22,
  sigma: number = 0.75,
): number {
  const height = rng.nextLogNormal(medianHeight, sigma);
  return Math.min(380, Math.max(6, Math.round(height)));
}
