import { describe, expect, it } from 'vitest';
import { mat4, vec4 } from 'gl-matrix';
import { Camera } from '../src/camera';

/** Whether a projection matrix is orthographic: its last row is (0, 0, 0, 1), so no point is divided by its distance. */
function isOrthographic(m: mat4): boolean {
  return m[3] === 0 && m[7] === 0 && m[11] === 0 && m[15] === 1;
}

/** Where a world point is drawn: x and y from -1 to 1 across the view, and its depth, 1 nearest and 0 farthest. */
function project(cam: Camera, point: [number, number, number]): [number, number, number] {
  const clip = vec4.transformMat4(vec4.create(), [point[0], point[1], point[2], 1], cam.getViewProjectionMatrix());
  return [clip[0] / clip[3], clip[1] / clip[3], clip[2] / clip[3]];
}

/** An orthographic camera looking straight down at (100, 200) from `height`, on a 1600 by 1000 canvas. */
function orthographic(height = 1000): Camera {
  const cam = new Camera({ eye: [100, 200, height], lookAt: [100, 200, 0], up: [0, 1, 0] });
  cam.resize(1600, 1000);
  cam.setProjection('orthographic');
  cam.update();
  return cam;
}

/** Half the height of the ground a 45 degree view shows at `distance`. */
const halfHeight = (distance: number) => distance * Math.tan((45 / 2) * (Math.PI / 180));

describe('a lasting orthographic Camera', () => {
  it('stays orthographic through update, resize and resetCamera, until it is set back to perspective', () => {
    const cam = orthographic();
    expect(cam.getProjection()).toBe('orthographic');
    expect(isOrthographic(cam.getProjectionMatrix())).toBe(true);

    cam.update();
    cam.resize(800, 800);
    expect(isOrthographic(cam.getProjectionMatrix())).toBe(true);

    // A host framing a map resets the camera, and so does autk-map's R key.
    cam.resetCamera([0, 1, 0], [0, 0, 0], [0, 0, 5000]);
    cam.update();
    expect(cam.getProjection()).toBe('orthographic');
    expect(isOrthographic(cam.getProjectionMatrix())).toBe(true);
    expect(project(cam, [halfHeight(5000), 0, 0])[0]).toBeCloseTo(1, 4);

    cam.setProjection('perspective');
    cam.update();
    expect(cam.getProjection()).toBe('perspective');
    expect(isOrthographic(cam.getProjectionMatrix())).toBe(false);
  });

  it('shows at the point it looks at the ground a perspective view shows there, and zooms at the cursor', () => {
    const cam = orthographic();
    const half = halfHeight(1000);
    const [left, bottom] = cam.getGroundPoint(0, 0, 1e6);
    const [right, top] = cam.getGroundPoint(1, 1, 1e6);
    expect(left).toBeCloseTo(100 - half * 1.6, 3);
    expect(right).toBeCloseTo(100 + half * 1.6, 3);
    expect(bottom).toBeCloseTo(200 - half, 3);
    expect(top).toBeCloseTo(200 + half, 3);
    const corner = project(cam, [right, top, 0]);
    expect(corner[0]).toBeCloseTo(1, 3);
    expect(corner[1]).toBeCloseTo(1, 3);

    // Zooming in at a cursor in the lower right narrows the bounds and keeps the ground under the cursor there.
    const cursor = cam.getGroundPoint(0.75, 0.25, 1e6);
    cam.zoom(-1, 0.75, 0.25);
    cam.update();
    const [left2] = cam.getGroundPoint(0, 0.5, 1e6);
    const [right2] = cam.getGroundPoint(1, 0.5, 1e6);
    expect(right2 - left2).toBeLessThan((right - left) * 0.9);
    const under = cam.getGroundPoint(0.75, 0.25, 1e6);
    expect(under[0]).toBeCloseTo(cursor[0], 3);
    expect(under[1]).toBeCloseTo(cursor[1], 3);
    const drawn = project(cam, [cursor[0], cursor[1], 0]);
    expect(drawn[0]).toBeCloseTo(0.5, 3);
    expect(drawn[1]).toBeCloseTo(-0.5, 3);
  });

  it('moves the view with a pan, and tilts it', () => {
    const cam = orthographic();
    cam.translate(0.1, 0); // a tenth of the eye's height to the right
    cam.update();
    const [x, y] = cam.getGroundPoint(0.5, 0.5, 1e6);
    expect(x).toBeCloseTo(200, 3);
    expect(y).toBeCloseTo(200, 3);
    expect(project(cam, [100, 200, 0])[0]).toBeCloseTo(-100 / (halfHeight(1000) * 1.6), 3);

    // Looking straight down, a point over the middle is drawn on it; tilted toward the horizon, above it.
    expect(project(cam, [200, 200, 100])[1]).toBeCloseTo(0, 3);
    cam.pitch(-0.5);
    cam.update();
    const [cx, cy] = cam.getGroundPoint(0.5, 0.5, 1e6);
    expect(cx).toBeCloseTo(200, 2);
    expect(cy).toBeCloseTo(200 + 1000 * Math.tan(0.5), 2);
    const middle = project(cam, [cx, cy, 0]);
    expect(middle[0]).toBeCloseTo(0, 3);
    expect(middle[1]).toBeCloseTo(0, 3);
    expect(project(cam, [cx, cy, 100])[1]).toBeGreaterThan(0.05);
    const [qx, qy] = cam.getGroundPoint(0.25, 0.75, 1e6);
    const quarter = project(cam, [qx, qy, 0]);
    expect(quarter[0]).toBeCloseTo(-0.5, 3);
    expect(quarter[1]).toBeCloseTo(0.5, 3);
  });

  it('draws a point 300 m up within its depth range, also when the eye is lower than the point', () => {
    for (const height of [1000, 100]) {
      const cam = orthographic(height);
      const ground = project(cam, [100, 200, 0])[2];
      const roof = project(cam, [100, 200, 300])[2];
      expect(ground).toBeGreaterThan(0);
      expect(roof).toBeLessThan(1);
      expect(roof).toBeGreaterThan(ground); // reversed depth, as in perspective: the nearer point is greater

      cam.pitch(-0.6);
      cam.update();
      const [x, y] = cam.getGroundPoint(0.5, 0.5, 1e6);
      const tiltedGround = project(cam, [x, y, 0])[2];
      const tiltedRoof = project(cam, [x, y, 300])[2];
      expect(tiltedGround).toBeGreaterThan(0);
      expect(tiltedRoof).toBeLessThan(1);
      expect(tiltedRoof).toBeGreaterThan(tiltedGround);
    }
  });
});
