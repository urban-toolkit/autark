import { afterEach, describe, expect, it, vi } from 'vitest';
import { mat4, vec3, vec4 } from 'gl-matrix';
import { Camera } from '../src/camera';
import { CameraMotion } from '../src/camera-motion';

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

/** A perspective camera and an orthographic one, alike otherwise, on a 1600 by 1000 canvas. */
function twins(up: number[], lookAt: number[], eye: number[]): [Camera, Camera] {
  const perspective = new Camera({ up, lookAt, eye });
  perspective.resize(1600, 1000);
  const cam = new Camera({ up, lookAt, eye });
  cam.resize(1600, 1000);
  cam.setProjection('orthographic');
  cam.update();
  return [perspective, cam];
}

/** Two points beside the point a camera looks at, right of it and above it on screen, a tenth of the eye's distance to it away. */
function besideLookAt(cam: Camera): Array<[number, number, number]> {
  const eye = cam.getEye();
  const lookAt = cam.getLookAt();
  const forward = vec3.sub([0, 0, 0], lookAt, eye);
  const offset = vec3.length(forward) * 0.1;
  vec3.normalize(forward, forward);
  const right = vec3.normalize([0, 0, 0], vec3.cross([0, 0, 0], forward, cam.getUp()));
  const up = vec3.cross([0, 0, 0], right, forward);
  return [right, up].map((axis) => [0, 1, 2].map((i) => lookAt[i] + axis[i] * offset) as [number, number, number]);
}

/** The ground point drawn at a screen position, `x` and `y` from 0 to 1, found from the camera's matrix alone. */
function groundUnder(cam: Camera, x: number, y: number): [number, number] {
  const inverse = mat4.invert(new Array<number>(16).fill(0), Array.from(cam.getViewProjectionMatrix()))!;
  // Two points drawn at this screen position, at two depths: the line through them crosses the ground once.
  const [a, b] = [0.25, 0.75].map((depth) => {
    const p = vec4.transformMat4([0, 0, 0, 0], [x * 2 - 1, y * 2 - 1, depth, 1], inverse);
    return [p[0] / p[3], p[1] / p[3], p[2] / p[3]];
  });
  const s = a[2] / (a[2] - b[2]);
  return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s];
}

/** Checks that two cameras draw points at the same places on screen. */
function expectDrawnAlike(cam: Camera, other: Camera, points: Array<[number, number, number]>) {
  for (const point of points) {
    const [x, y] = project(cam, point);
    const [otherX, otherY] = project(other, point);
    expect(x).toBeCloseTo(otherX, 4);
    expect(y).toBeCloseTo(otherY, 4);
  }
}

/**
 * Plays a motion on each camera at once, in frames 50 ms apart on a replaced browser clock, and runs `onFrame` after
 * each frame, from the first of each step, at its start, to the last, at its end.
 */
async function playInFrames(motion: CameraMotion, cameras: Camera[], onFrame: () => void): Promise<void> {
  let now = 0;
  let requested: FrameRequestCallback[] = [];
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => requested.push(callback));
  let playing = cameras.length;
  for (const camera of cameras) void motion.play(camera).then(() => playing--);
  for (let frame = 0; frame < 1000; frame++) {
    // A step starts, and asks for its first frame, once the promises before it settle.
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (playing === 0) return;
    const due = requested;
    requested = [];
    for (const callback of due) callback(now);
    onFrame();
    now += 50;
  }
  throw new Error('The motion did not end within 1000 frames');
}

/**
 * Compares an orthographic camera's scale with its perspective twin's at the ground the twin's view center looks at:
 * how many times farther from the middle of the view the orthographic camera draws a point beside that ground. Also
 * gives where the orthographic camera draws that ground.
 */
function againstTwin(perspective: Camera, cam: Camera): { ratio: number; middle: [number, number, number] } {
  const [x, y] = perspective.getGroundPoint(0.5, 0.5, 1e6);
  const view = perspective.getModelViewMatrix();
  // 100 units along the screen's right axis, the first row of the view matrix.
  const beside: [number, number, number] = [x + view[0] * 100, y + view[4] * 100, view[8] * 100];
  return { ratio: project(cam, beside)[0] / project(perspective, beside)[0], middle: project(cam, [x, y, 0]) };
}

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

  it('shows a level view what a perspective view shows at the point it looks at, also after a wheel zoom', () => {
    // The gallery's street-level camera: the eye 12 up, looking at a point 45 ahead and 15 up.
    const [perspective, cam] = twins([0, 0, 1], [45, 0, 15], [0, 0, 12]);
    const beside = besideLookAt(perspective);
    expectDrawnAlike(cam, perspective, beside);

    // A wheel step in at the middle of the view brings both eyes closer to that point, and draws it larger.
    const [before] = project(cam, beside[0]!);
    for (const camera of [perspective, cam]) {
      camera.zoom(-1, 0.5, 0.5);
      camera.update();
    }
    expectDrawnAlike(cam, perspective, beside);
    expect(project(cam, beside[0]!)[0]).toBeGreaterThan(before * 1.02);
  });

  it('shows ground raised above z = 0 what a perspective view shows at the point it looks at', () => {
    // Terrain heights are absolute: here the eye is 2000 up, looking straight down at ground 1600 up.
    const [perspective, cam] = twins([0, 1, 0], [100, 200, 1600], [100, 200, 2000]);
    expectDrawnAlike(cam, perspective, besideLookAt(perspective));
  });

  it('changes nothing when set to the projection it already has, also while the bounds of setOrthographicBounds hold', () => {
    // What a camera draws, and where its ground helpers put two corners of the view.
    const state = (cam: Camera) => {
      cam.update(); // as each frame does
      return {
        projection: cam.getProjection(),
        matrix: Array.from(cam.getViewProjectionMatrix()),
        corners: [cam.getGroundPoint(0, 0, 1e6), cam.getGroundPoint(1, 1, 1e6)],
      };
    };
    const bounded = () => {
      const cam = new Camera();
      cam.resize(1000, 800);
      cam.setOrthographicBounds(0, 1000, 0, 800);
      return cam;
    };
    const perspective = () => {
      const cam = new Camera({ eye: [100, 200, 1000], lookAt: [100, 200, 0], up: [0, 1, 0] });
      cam.resize(1600, 1000);
      return cam;
    };
    for (const make of [bounded, orthographic, perspective]) {
      const cam = make();
      const untouched = make();
      cam.setProjection(cam.getProjection());
      expect(state(cam)).toEqual(state(untouched));
      // A reset, as a host framing a map or the R key makes, leaves them alike too. It ends fixed bounds, and a camera
      // set to 'orthographic' while they held stays orthographic, as its twin does once set so.
      for (const camera of [cam, untouched]) camera.resetCamera([0, 1, 0], [0, 0, 0], [0, 0, 5000]);
      if (make === bounded) untouched.setProjection('orthographic');
      expect(state(cam)).toEqual(state(untouched));
    }
  });

  it('stays orthographic through a later resetCamera when set so while the bounds of setOrthographicBounds hold', () => {
    const cam = new Camera();
    cam.resize(1600, 1000);
    cam.setOrthographicBounds(0, 1000, 0, 800);
    cam.setProjection('orthographic');
    // fitBounds, setView, the R key and hosts frame a map with resetCamera, which ends the bounds.
    cam.resetCamera([0, 1, 0], [0, 0, 0], [0, 0, 5000]);
    cam.update();
    expect(cam.getProjection()).toBe('orthographic');
    expect(isOrthographic(cam.getProjectionMatrix())).toBe(true);
    const corner = project(cam, [halfHeight(5000) * 1.6, halfHeight(5000), 0]);
    expect(corner[0]).toBeCloseTo(1, 4);
    expect(corner[1]).toBeCloseTo(1, 4);
  });

  it('keeps the ground under the cursor there when it zooms a tilted view', () => {
    const cam = orthographic();
    cam.pitch(-0.6);
    cam.update();
    for (const [x, y] of [[0.75, 0.25], [0.2, 0.9]]) {
      const ground = groundUnder(cam, x, y);
      const before = 1 / cam.getProjectionMatrix()[5]; // half the view's height
      cam.zoom(-1, x, y);
      cam.update();
      const [drawnX, drawnY] = project(cam, [ground[0], ground[1], 0]);
      expect(drawnX).toBeCloseTo(x * 2 - 1, 4);
      expect(drawnY).toBeCloseTo(y * 2 - 1, 4);
      expect(1 / cam.getProjectionMatrix()[5]).toBeLessThan(before * 0.95);
    }
  });

  it('shows what the perspective view shows when it is switched after a wheel zoom and a pan', () => {
    // These moves leave the point the camera looks at one unit ahead of the eye.
    const moved = () => {
      const camera = new Camera({ eye: [100, 200, 1000], lookAt: [100, 200, 0], up: [0, 1, 0] });
      camera.resize(1600, 1000);
      camera.zoom(-1, 0.75, 0.25);
      camera.translate(0.1, 0);
      camera.update();
      return camera;
    };
    const perspective = moved();
    const cam = moved();
    cam.setProjection('orthographic');
    cam.update();
    // Points beside the ground the view center looks at, straight below the eye.
    const [x, y, height] = perspective.getEye();
    expectDrawnAlike(cam, perspective, [[x + height * 0.1, y, 0], [x, y + height * 0.1, 0]]);
  });

  it('keeps its view when a host frames it again with the eye, look-at and up it reports, after a wheel zoom and a pan', () => {
    // A host keeps a map's view this way while it draws the map again.
    const moved = () => {
      const camera = orthographic();
      camera.zoom(-1, 0.75, 0.25);
      camera.translate(0.1, 0);
      camera.update();
      return camera;
    };
    const cam = moved();
    const restored = moved();
    restored.resetCamera(restored.getUp(), restored.getLookAt(), restored.getEye());
    restored.update();
    // Points beside the ground the view center looks at, straight below the eye.
    const [x, y, height] = cam.getEye();
    expectDrawnAlike(restored, cam, [[x + height * 0.3, y, 0], [x, y - height * 0.2, 0]]);
  });
});

describe('a lasting orthographic Camera in a CameraMotion', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** A perspective camera and an orthographic twin 1000 up over the origin, looking straight down. */
  const topDown = () => twins([0, 1, 0], [0, 0, 0], [0, 0, 1000]);
  /**
   * The same twins tilted 60 degrees toward the horizon, as a drag with Shift tilts. The tilt keeps the eye's distance
   * to the point it looks at, 1000, which sizes the orthographic view, while the view center now meets the ground 2000
   * away, at the scene center that a CameraMotion turns about.
   */
  const tilted = () => {
    const cameras = topDown();
    for (const camera of cameras) {
      camera.pitch(-Math.PI / 3);
      camera.update();
    }
    return cameras;
  };

  const motions: Array<[string, () => [Camera, Camera], () => CameraMotion]> = [
    ['a roll', topDown, () => new CameraMotion().roll(15, 1)],
    ['a yaw', tilted, () => new CameraMotion().yaw(90, 3)],
    ['a pitch', tilted, () => new CameraMotion().pitch(20, 1)],
    ['a zoom out', tilted, () => new CameraMotion().zoomOut(2, 1)],
    ['a zoom in', tilted, () => new CameraMotion().zoomIn(2, 1)],
    ['a roll, a yaw, a pitch and a zoom in turn', tilted, () => new CameraMotion().roll(15, 1).yaw(90, 1).pitch(20, 1).zoomOut(2, 1)],
  ];

  it.each(motions)('changes its scale through %s only as its perspective twin does at the scene center, in every frame', async (_name, start, motion) => {
    const [perspective, cam] = start();
    const { ratio: before } = againstTwin(perspective, cam);
    await playInFrames(motion(), [perspective, cam], () => {
      const { ratio, middle } = againstTwin(perspective, cam);
      expect(ratio).toBeCloseTo(before, 3);
      // Both turn about the scene center, which stays in the middle of the view.
      expect(middle[0]).toBeCloseTo(0, 3);
      expect(middle[1]).toBeCloseTo(0, 3);
    });
    expect(cam.getProjection()).toBe('orthographic');
  });
});
