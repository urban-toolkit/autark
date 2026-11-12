import { describe, expect, it } from 'vitest';
import { mat4, vec3 } from 'gl-matrix';
import { Camera } from '../src/camera';


/** A camera looking straight down from `eye`, then tilted towards the horizon by `tilt` radians. */
function camera(eye: number[], tilt = 0): Camera {
  const cam = new Camera({ eye, lookAt: [eye[0]!, eye[1]!, 0], up: [0, 1, 0] });
  cam.pitch(-tilt); // negative pitch leans the view towards the horizon
  cam.resize(1600, 1000);
  cam.update();
  return cam;
}

describe('Camera.getGroundPoint', () => {
  it('finds the point under the centre of a top-down view', () => {
    const [x, y] = camera([100, 200, 1000]).getGroundPoint(0.5, 0.5, 1e6);
    expect(x).toBeCloseTo(100, 6);
    expect(y).toBeCloseTo(200, 6);
  });

  it('finds the half-width and half-height of a top-down view at the edges', () => {
    const cam = camera([0, 0, 1000]);
    const half = 1000 * Math.tan((45 / 2) * (Math.PI / 180));
    const [rx] = cam.getGroundPoint(1, 0.5, 1e6);
    const [, ty] = cam.getGroundPoint(0.5, 1, 1e6);
    expect(rx).toBeCloseTo(half * 1.6, 3);
    expect(ty).toBeCloseTo(half, 3);
  });

  it('agrees with where getWorldRayDirection meets z = 0', () => {
    const cam = camera([0, 0, 800], 0.6);
    const d = cam.getWorldRayDirection(0.2, 0.3);
    const t = -800 / d[2];
    const [x, y] = cam.getGroundPoint(0.2, 0.3, 1e9);
    expect(x).toBeCloseTo(d[0] * t, 6);
    expect(y).toBeCloseTo(d[1] * t, 6);
  });

  it('clamps a hit that is farther than maxDistance', () => {
    const cam = camera([0, 0, 800], 0.9);
    const [x, y] = cam.getGroundPoint(0.5, 0.9, 1000);
    const d = cam.getWorldRayDirection(0.5, 0.9);
    expect(-800 / d[2]).toBeGreaterThan(1000); // the real hit is farther
    expect(x).toBeCloseTo(d[0] * 1000, 6);
    expect(y).toBeCloseTo(d[1] * 1000, 6);
  });

  it('uses maxDistance when the ray points away from the ground', () => {
    // Looking above the horizon, the top edge never reaches z = 0.
    const cam = camera([0, 0, 100], 1.2);
    const [x, y] = cam.getGroundPoint(0.5, 1, 5000);
    const d = cam.getWorldRayDirection(0.5, 1);
    expect(d[2]).toBeGreaterThan(0);
    expect(x).toBeCloseTo(d[0] * 5000, 6);
    expect(y).toBeCloseTo(d[1] * 5000, 6);
  });
});

function polygonArea(polygon: Array<[number, number]>): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area / 2;
}

describe('Camera.getGroundFootprint', () => {
  it('is the four ground hits of the corners for a top-down view', () => {
    const cam = camera([0, 0, 1000]);
    const polygon = cam.getGroundFootprint(1e6);
    expect(polygon).toHaveLength(4);
    for (const [x, y] of [[0, 0], [1, 0], [1, 1], [0, 1]] as const) {
      const [ex, ey] = cam.getGroundPoint(x, y, 1e9);
      expect(polygon.some(([px, py]) => Math.abs(px - ex) < 1e-6 && Math.abs(py - ey) < 1e-6)).toBe(true);
    }
  });

  it('is cut by the reach around the eye', () => {
    const polygon = camera([0, 0, 1000]).getGroundFootprint(100);
    expect(polygon.length).toBeGreaterThanOrEqual(3);
    for (const [px, py] of polygon) {
      expect(Math.abs(px)).toBeLessThanOrEqual(100 + 1e-9);
      expect(Math.abs(py)).toBeLessThanOrEqual(100 + 1e-9);
    }
  });

  it('follows the eye', () => {
    const polygon = camera([500, -300, 1000]).getGroundFootprint(100);
    for (const [px, py] of polygon) {
      expect(Math.abs(px - 500)).toBeLessThanOrEqual(100 + 1e-9);
      expect(Math.abs(py + 300)).toBeLessThanOrEqual(100 + 1e-9);
    }
  });

  it('contains every ground point the screen sees within reach, near the horizon', () => {
    const cam = camera([0, 0, 100], 1.3);
    const reach = 2000;
    const polygon = cam.getGroundFootprint(reach);
    // Inside a convex polygon: never farther than 1 mm outside any edge (points on the screen edge lie on it).
    const inside = (x: number, y: number) => {
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i]!;
        const b = polygon[(i + 1) % polygon.length]!;
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const side = ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])) / length; // signed distance, left positive
        const orientation = polygonArea(polygon) >= 0 ? 1 : -1;
        if (side * orientation < -0.001) return false;
      }
      return true;
    };
    let checked = 0;
    for (let i = 0; i <= 30; i++) {
      for (let j = 0; j <= 30; j++) {
        const d = cam.getWorldRayDirection(i / 30, j / 30);
        if (d[2] >= -1e-6) continue; // never reaches the ground
        const t = -100 / d[2];
        const hit: [number, number] = [d[0] * t, d[1] * t];
        if (Math.hypot(hit[0], hit[1]) > reach) continue;
        expect(inside(hit[0], hit[1]), `screen ${i / 30}, ${j / 30}`).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('is empty when the camera sees only sky', () => {
    expect(camera([0, 0, 100], 2.2).getGroundFootprint(1e6)).toEqual([]);
  });
});

// ── Rays must match what is rendered ─────────────────────────────────────────

/**
 * The ray through a normalized screen position, found by unprojecting through the
 * inverse of the rendering matrices. It shares no code with the camera's ray helper.
 */
function renderedRay(cam: Camera, x: number, y: number): [number, number, number] {
  const viewProjection = mat4.multiply(mat4.create(), cam.getProjectionMatrix(), cam.getModelViewMatrix());
  const inverse = mat4.invert(mat4.create(), viewProjection)!;
  const near = vec3.transformMat4(vec3.create(), [2 * x - 1, 2 * y - 1, 0], inverse);
  const far = vec3.transformMat4(vec3.create(), [2 * x - 1, 2 * y - 1, 1], inverse);
  const dir = vec3.normalize(vec3.create(), vec3.subtract(vec3.create(), far, near));
  const forward = vec3.subtract(vec3.create(), cam.getLookAt(), cam.getEye());
  if (vec3.dot(dir, forward) < 0) vec3.negate(dir, dir);
  return [dir[0]!, dir[1]!, dir[2]!];
}

function rawCamera(eye: number[], lookAt: number[], up: number[], width = 1600, height = 1000): Camera {
  const cam = new Camera({ eye, lookAt, up });
  cam.resize(width, height);
  cam.update();
  return cam;
}

describe('Camera rays match the rendering matrices', () => {
  const cases: Array<[string, () => Camera]> = [
    ['the review camera (up not perpendicular to the view)', () => rawCamera([0, -100, 100], [0, 1000, 80], [0, 1, 0])],
    ['an up vector that is not unit length', () => rawCamera([0, -100, 100], [0, 1000, 80], [0, 3, 0])],
    ['an up vector leaning towards the view direction', () => rawCamera([50, 20, 400], [400, 900, 0], [0.2, 0.3, 1])],
    ['a square viewport', () => rawCamera([0, -100, 100], [0, 1000, 80], [0, 1, 0], 800, 800)],
    ['an ordinary pitched and yawed camera', () => {
      const cam = new Camera({ eye: [100, 200, 1000], lookAt: [100, 200, 0], up: [0, 1, 0] });
      cam.pitch(-0.7);
      cam.yaw(0.4);
      cam.resize(1600, 1000);
      cam.update();
      return cam;
    }],
    ['a camera after zooming towards a point and panning', () => {
      const cam = new Camera({ eye: [0, -100, 100], lookAt: [0, 1000, 80], up: [0, 1, 0] });
      cam.pitch(0.2);
      cam.resize(1600, 1000);
      cam.update();
      cam.zoom(1, 0.3, 0.6);
      cam.translate(0.1, -0.05);
      cam.update();
      return cam;
    }],
    ['a camera looking straight down', () => rawCamera([10, -20, 700], [10, -20, 0], [0, 1, 0])],
  ];

  it.each(cases)('gives the rendered ray for %s', (_label, make) => {
    const cam = make();
    for (let i = 0; i <= 10; i++) {
      for (let j = 0; j <= 10; j++) {
        const expected = renderedRay(cam, i / 10, j / 10);
        const actual = cam.getWorldRayDirection(i / 10, j / 10);
        for (let k = 0; k < 3; k++) expect(actual[k]!, `screen ${i / 10}, ${j / 10}, axis ${k}`).toBeCloseTo(expected[k]!, 4);
      }
    }
  });

  it.each(cases)('finds the ground the rendering shows, within reach, for %s', (_label, make) => {
    const cam = make();
    const eye = cam.getEye();
    const reach = 2000;
    const polygon = cam.getGroundFootprint(reach);
    let hits = 0;
    for (let i = 0; i <= 30; i++) {
      for (let j = 0; j <= 30; j++) {
        const d = renderedRay(cam, i / 30, j / 30);
        if (d[2] >= -1e-6) continue;
        const t = -eye[2] / d[2];
        const hit: [number, number] = [eye[0] + d[0] * t, eye[1] + d[1] * t];
        if (Math.hypot(hit[0] - eye[0], hit[1] - eye[1]) > reach) continue;
        hits++;
        expect(pointInPolygon(polygon, hit), `screen ${i / 30}, ${j / 30}`).toBe(true);
        const [gx, gy] = cam.getGroundPoint(i / 30, j / 30, 1e9);
        // The reference inverts float32 matrices, so allow about 0.03% at this range.
        expect(Math.abs(gx - hit[0])).toBeLessThan(0.5);
        expect(Math.abs(gy - hit[1])).toBeLessThan(0.5);
      }
    }
    expect(hits).toBeGreaterThan(50);
  });
});

/**
 * Inside a convex polygon, with slack for points on an edge: the reference rays
 * come from inverting float32 matrices, which is good to about 0.1% at this range.
 */
function pointInPolygon(polygon: Array<[number, number]>, [x, y]: [number, number], slack = 2): boolean {
  const orientation = polygonArea(polygon) >= 0 ? 1 : -1;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const side = ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])) / length;
    if (side * orientation < -slack) return false;
  }
  return true;
}
