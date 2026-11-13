/**
 * @module Camera
 * Interactive camera primitives for WebGPU scene navigation.
 *
 * This module defines the `Camera` class, which keeps the current eye,
 * look-at, and up vectors in sync with view and projection matrices. It also
 * exposes a one-shot helper for building view-projection matrices from
 * explicit parameters when a persistent camera instance is not needed.
 */

import { vec3, mat4 } from 'gl-matrix';

/**
 * Initial camera state used to seed or reset a `Camera` instance.
 */
/** How far below `z = 0` an orthographic camera still draws, in world units. */
const ORTHOGRAPHIC_DEPTH_BELOW = 10;
/** Total depth range of an orthographic camera, in world units. */
const ORTHOGRAPHIC_DEPTH_RANGE = 100;

export interface CameraData {
    /** World-space up vector. */
    up: number[];
    /** Initial eye (camera) position in world space. */
    eye: number[];
    /** Point the camera looks at in world space. */
    lookAt: number[];
}

/**
 * Explicit parameters for building a single view-projection matrix.
 */
export interface ViewProjectionParams {
    /** Eye (camera) position in world space. */
    eye:    [number, number, number];
    /** Point the camera looks at in world space. */
    lookAt: [number, number, number];
    /** World-space up vector. */
    up:     [number, number, number];
    /** Vertical field of view in degrees. */
    fovDeg: number;
    /** Viewport aspect ratio (width / height). */
    aspect: number;
    /** Near clipping plane distance. */
    near:   number;
    /** Far clipping plane distance. */
    far:    number;
}

/**
 * Interactive 3-DOF camera for orbit-style navigation.
 *
 * The camera tracks world-space eye, look-at, and up vectors together with the
 * current viewport size. Call the navigation methods to adjust state, then
 * call {@link Camera.update} to rebuild the matrices. Projection uses
 * reversed-Z depth mapping for improved precision at distance.
 *
 * @example
 * const camera = new Camera();
 * camera.resize(width, height);
 * camera.zoom(-1, 0.5, 0.5);
 * camera.update();
 */
export class Camera {
    /** Eye (camera) position in world space. */
    protected wEye: vec3 = vec3.create();
    /** Look-at target in world space. */
    protected wLookAt: vec3 = vec3.create();
    /** Normalised direction vector from eye to look-at. */
    protected wEyeDir: vec3 = vec3.create();
    /** World-space up vector. */
    protected wUp: vec3 = vec3.create();
    /** Near clipping plane distance. */
    protected wNear: number = 0;
    /** Far clipping plane distance. */
    protected wFar: number = 0;
    /** Vertical field of view in radians. */
    protected fovy = (45 * Math.PI) / 180.0;
    /** Current projection matrix. */
    protected mProjectionMatrix: mat4 = mat4.create();
    /** Current view matrix. */
    protected mViewMatrix: mat4 = mat4.create();
    private viewportWidth: number = 0;
    private viewportHeight: number = 0;
    /** Bounds of an orthographic projection, or `null` for the perspective camera. */
    private orthographic: { left: number; right: number; bottom: number; top: number } | null = null;

    private static defaultParams: CameraData = {
        up: [0, 1, 0],
        eye: [0, 0, 10000],
        lookAt: [0, 0, 0],
    };

    /**
     * Creates a camera with the provided initial state.
     *
     * @param params - Initial camera position and orientation (defaults to `[0, 1, 0]` up, 10k units above origin).
     * @throws Never throws.
     * @example
     * const camera = new Camera();
     * const custom = new Camera({ eye: [0, 0, 500], lookAt: [0, 0, 0], up: [0, 1, 0] });
     */
    constructor(params: CameraData = Camera.defaultParams) {
        this.resetCamera(params.up, params.lookAt, params.eye);
    }

    /**
     * Resets the camera to a new position, orientation, and default projection.
     *
     * @param wUp - World-space up vector.
     * @param wLookAt - Point to look at in world space.
     * @param wEye - Eye position in world space.
     * @param far - Far clipping distance; defaults to 500,000 world units.
     * @param near - Near clipping distance; defaults to 1 world unit. Explicit small-unit views may use a smaller value.
     * @throws Never throws.
     * @example
     * camera.resetCamera([0, 1, 0], [100, 200, 0], [100, 200, 500]);
     * camera.update();
     */
    public resetCamera(wUp: number[], wLookAt: number[], wEye: number[], far = 5e5, near = 1): void {
        this.orthographic = null;
        this.fovy = (45 * Math.PI) / 180.0;
        this.mProjectionMatrix = mat4.create();
        this.mViewMatrix = mat4.create();
        this.wNear = near;
        this.wFar = far;
        this.wLookAt = vec3.fromValues(wLookAt[0], wLookAt[1], wLookAt[2]);
        this.wEye = vec3.fromValues(wEye[0], wEye[1], wEye[2]);
        this.updateEyeDirAndLen();
        this.wUp = vec3.fromValues(wUp[0], wUp[1], wUp[2]);
    }

    /**
     * Returns the current projection matrix.
     *
     * @returns The projection matrix in column-major `mat4`.
     * @throws Never throws.
     * @example
     * camera.update();
     * const proj = camera.getProjectionMatrix();
     */
    public getProjectionMatrix(): mat4 {
        return this.mProjectionMatrix;
    }

    public getEye(): [number, number, number] {
        return [this.wEye[0], this.wEye[1], this.wEye[2]];
    }

    public getLookAt(): [number, number, number] {
        return [this.wLookAt[0], this.wLookAt[1], this.wLookAt[2]];
    }

    public getUp(): [number, number, number] {
        return [this.wUp[0], this.wUp[1], this.wUp[2]];
    }

    public getFovyRadians(): number {
        return this.fovy;
    }

    public getNear(): number {
        return this.wNear;
    }

    public getFar(): number {
        return this.wFar;
    }

    public getViewportHeight(): number {
        return this.viewportHeight;
    }

    public getViewportWidth(): number {
        return this.viewportWidth;
    }

    public getViewProjectionMatrix(): Float32Array {
        return new Float32Array(mat4.mul(mat4.create(), this.mProjectionMatrix, this.mViewMatrix));
    }

    public getWorldRayDirection(x: number, y: number): [number, number, number] {
        const direction = this.screenCoordToWorldDir(x, y);
        return [direction[0], direction[1], direction[2]];
    }

    /**
     * Finds where the ray through a screen position meets the ground plane (`z = 0`).
     *
     * A ray that points away from the ground, or is parallel to it, has no hit;
     * a hit farther than `maxDistance` is too far to be useful. In both cases the
     * point `maxDistance` along the ray is returned instead.
     *
     * @param x - Normalized screen X (0–1, left to right).
     * @param y - Normalized screen Y (0–1, bottom to top).
     * @param maxDistance - Farthest distance along the ray, in world units.
     * @returns The ground point `[x, y]`.
     * @throws Never throws.
     * @example
     * const [gx, gy] = camera.getGroundPoint(0.5, 0.5, 50000); // what the view centre looks at
     */
    public getGroundPoint(x: number, y: number, maxDistance: number): [number, number] {
        const bounds = this.orthographic;
        if (bounds) {
            return [bounds.left + (bounds.right - bounds.left) * x, bounds.bottom + (bounds.top - bounds.bottom) * y];
        }
        const eye = this.wEye;
        const direction = this.screenCoordToWorldDir(x, y);
        const groundDistance = Math.abs(direction[2]) > 1e-6 ? -eye[2] / direction[2] : Number.POSITIVE_INFINITY;
        const distance = groundDistance > 0 ? Math.min(groundDistance, maxDistance) : maxDistance;
        return [eye[0] + direction[0] * distance, eye[1] + direction[1] * distance];
    }

    /**
     * The ground the camera can see within a distance, as a convex polygon.
     *
     * Each side of the view pyramid is a plane through the eye; on the ground it
     * is a half-plane. The visible ground is the square of half-side `reach`
     * around the point below the eye, cut by those four half-planes. Unlike the
     * ground hits of the four corner rays, this also covers what the interior
     * of the screen sees near the horizon, where a corner ray points above the
     * ground.
     *
     * @param reach - Farthest ground distance from the point below the eye, in world units.
     * @returns Polygon vertices `[x, y]`, or an empty array when no ground is visible.
     * @throws Never throws.
     * @example
     * const polygon = camera.getGroundFootprint(50000);
     */
    public getGroundFootprint(reach: number): Array<[number, number]> {
        const bounds = this.orthographic;
        if (bounds) {
            // The view is a rectangle of ground; distance from the eye does not limit it.
            return [
                [bounds.left, bounds.bottom],
                [bounds.right, bounds.bottom],
                [bounds.right, bounds.top],
                [bounds.left, bounds.top],
            ];
        }
        const eye = this.wEye;
        const corners = ([[0, 0], [1, 0], [1, 1], [0, 1]] as const).map(([x, y]) => this.screenCoordToWorldDir(x, y));
        const centre = corners.reduce((sum, c) => vec3.add(sum, sum, c), [0, 0, 0] as vec3);

        let polygon: Array<[number, number]> = [
            [eye[0] - reach, eye[1] - reach],
            [eye[0] + reach, eye[1] - reach],
            [eye[0] + reach, eye[1] + reach],
            [eye[0] - reach, eye[1] + reach],
        ];

        for (let i = 0; i < 4; i++) {
            // Plain arrays keep the arithmetic in double precision.
            const normal = vec3.cross([0, 0, 0] as vec3, corners[i] as vec3, corners[(i + 1) % 4] as vec3);
            if (vec3.dot(normal, centre) < 0) vec3.negate(normal, normal);
            // A ground point p is inside this side of the pyramid when normal . (p - eye) >= 0.
            polygon = clipPolygon(polygon, (p) => normal[0] * (p[0] - eye[0]) + normal[1] * (p[1] - eye[1]) - normal[2] * eye[2]);
            if (polygon.length === 0) return [];
        }
        return polygon;
    }

    /**
     * Switches the camera to a top-down orthographic projection over a rectangle of ground.
     *
     * The camera stays orthographic until {@link resetCamera} is called:
     * {@link resize} and {@link update} keep the projection, and the ground and
     * ray helpers follow the bounds. World `z` from -10 to 90 is inside the depth range.
     * Ordinary 2D layers remain on the common ground plane and use drawing order.
     *
     * @param left - World X at the left edge.
     * @param right - World X at the right edge.
     * @param bottom - World Y at the bottom edge.
     * @param top - World Y at the top edge.
     * @throws Never throws.
     * @example
     * camera.setOrthographicBounds(0, 1000, 0, 800);
     */
    public setOrthographicBounds(left: number, right: number, bottom: number, top: number): void {
        this.orthographic = { left, right, bottom, top };
        mat4.identity(this.mViewMatrix);
        mat4.orthoZO(
            this.mProjectionMatrix,
            left,
            right,
            bottom,
            top,
            ORTHOGRAPHIC_DEPTH_BELOW,
            ORTHOGRAPHIC_DEPTH_BELOW - ORTHOGRAPHIC_DEPTH_RANGE,
        );
        this.wEye = vec3.fromValues((left + right) * 0.5, (bottom + top) * 0.5, 100);
        this.wLookAt = vec3.fromValues((left + right) * 0.5, (bottom + top) * 0.5, 0);
        this.wUp = vec3.fromValues(0, 1, 0);
        this.updateEyeDirAndLen();
    }

    /**
     * Returns the current view (model-view) matrix.
     *
     * @returns The view matrix in column-major `mat4`.
     * @throws Never throws.
     * @example
     * camera.update();
     * const view = camera.getModelViewMatrix();
     */
    public getModelViewMatrix(): mat4 {
        return this.mViewMatrix;
    }

    /**
     * Updates viewport size and recomputes matrices in one call.
     *
     * Pass drawable canvas pixel size, not CSS size.
     *
     * @param width - Viewport width in pixels.
     * @param height - Viewport height in pixels.
     * @throws Never throws.
     * @example
     * camera.resize(1920, 1080);  // calls update() internally
     */
    public resize(width: number, height: number): void {
        this.viewportWidth = width;
        this.viewportHeight = height;
        this.update();
    }

    /**
     * Zooms the camera at the cursor position, preserving it in world space.
     *
     * @param delta - Normalized scroll delta (positive = zoom out, negative = zoom in).
     * @param x - Normalized cursor X position (0–1, left to right).
     * @param y - Normalized cursor Y position (0–1, bottom to top).
     * @throws Never throws.
     * @example
     * camera.zoom(-1, 0.5, 0.5);  // zoom in at screen center
     * camera.update();
     */
    public zoom(delta: number, x: number, y: number): void {
        const zoomScale = Math.max(Math.abs(this.wEye[2]), 1) * 0.2;
        delta = -delta * zoomScale;
        const dir = this.screenCoordToWorldDir(x, y);
        vec3.scaleAndAdd(this.wEye, this.wEye, dir, delta);
        vec3.scaleAndAdd(this.wLookAt, this.wEye, this.wEyeDir, vec3.length(this.wEyeDir));
    }

    /**
     * Pans the camera in screen space, scaled by the current view distance.
     *
     * @param dx - Normalized horizontal drag delta (0–1).
     * @param dy - Normalized vertical drag delta (0–1).
     * @throws Never throws.
     * @example
     * camera.translate(0.1, 0);  // pan right
     * camera.update();
     */
    public translate(dx: number, dy: number): void {
        const scale = this.wEye[2];
        const X = vec3.create();
        vec3.normalize(X, vec3.cross(X, this.wEyeDir, this.wUp));
        const D = vec3.add(
            vec3.create(),
            vec3.scale(vec3.create(), X, dx * scale),
            vec3.scale(vec3.create(), this.wUp, dy * scale),
        );
        vec3.add(this.wEye, this.wEye, D);
        vec3.scaleAndAdd(this.wLookAt, this.wEye, this.wEyeDir, vec3.length(this.wEyeDir));
    }

    /**
     * Rotates the camera around the world Z-axis (compass bearing).
     *
     * @param delta - Rotation angle in radians.
     * @throws Never throws.
     * @example
     * camera.yaw(Math.PI / 4);  // rotate 45° clockwise
     * camera.update();
     */
    public yaw(delta: number): void {
        vec3.rotateZ(this.wEyeDir, this.wEyeDir, vec3.fromValues(0, 0, 0), delta);
        vec3.rotateZ(this.wUp, this.wUp, vec3.fromValues(0, 0, 0), delta);
        vec3.scaleAndAdd(this.wLookAt, this.wEye, this.wEyeDir, vec3.length(this.wEyeDir));
    }

    /**
     * Tilts the camera up or down (elevation angle).
     *
     * @param delta - Tilt angle in radians. Positive values tilt upward.
     * @throws Never throws.
     * @example
     * camera.pitch(-0.3);  // tilt downward ~17°
     * camera.update();
     */
    public pitch(delta: number): void {
        delta = -delta;
        vec3.add(
            this.wEyeDir,
            vec3.scale(vec3.create(), this.wUp, Math.sin(delta)),
            vec3.scale(vec3.create(), this.wEyeDir, Math.cos(delta)),
        );
        vec3.normalize(this.wEyeDir, this.wEyeDir);
        vec3.scaleAndAdd(this.wLookAt, this.wEye, this.wEyeDir, vec3.length(this.wEyeDir));
        vec3.cross(this.wUp, vec3.cross(vec3.create(), this.wEyeDir, this.wUp), this.wEyeDir);
        vec3.normalize(this.wUp, this.wUp);
    }

    /**
     * Returns a scalar proportional to the current map zoom for marker sizing.
     *
     * This uses the camera eye height, which is the quantity changed by the map
     * zoom interaction and therefore tracks zoom more reliably than the
     * normalized eye-direction vector.
     */
    public getZoomScale(): number {
        return Math.max(Math.abs(this.wEye[2]), 1) / 10000;
    }

    /**
     * Rebuilds view and projection matrices from the current camera state.
     *
     * Uses reversed-Z depth for improved precision at long range.
     *
     * @throws Never throws.
     * @example
     * camera.zoom(-1, 0.5, 0.5);
     * camera.update();  // rebuild matrices after navigation change
     */
    public update(): void {
        if (this.orthographic) return;
        const aspect = this.viewportWidth / this.viewportHeight;
        mat4.lookAt(this.mViewMatrix, this.wEye, this.wLookAt, this.wUp);
        // Reversed-Z: swap near/far so near→1 and far→0 in NDC.
        // Combined with depthClearValue=0 and depthCompare='greater-equal' this
        // distributes float32 precision logarithmically, eliminating z-fighting
        // at distance without requiring an absurdly large far plane.
        mat4.perspectiveZO(this.mProjectionMatrix, this.fovy, aspect, this.wFar, this.wNear);
    }

    /**
     * Builds a stateless view-projection matrix from explicit parameters.
     *
     * @param p - Camera and projection parameters.
     * @returns Column-major `Float32Array` of length 16.
     * @throws Never throws.
     * @example
     * const vp = Camera.buildViewProjection({
     *   eye: [0, 0, 500], lookAt: [0, 0, 0], up: [0, 1, 0],
     *   fovDeg: 45, aspect: 16/9, near: 0.1, far: 10000,
     * });
     */
    public static buildViewProjection(p: ViewProjectionParams): Float32Array {
        const view = mat4.lookAt(mat4.create(), p.eye, p.lookAt, p.up);
        const proj = mat4.perspectiveZO(mat4.create(), p.fovDeg * (Math.PI / 180), p.aspect, p.near, p.far);
        return new Float32Array(mat4.mul(mat4.create(), proj, view));
    }

    /**
     * Converts a normalized screen coordinate to a world-space direction ray.
     *
     * @param x - Normalized screen X (0–1, left to right).
     * @param y - Normalized screen Y (0–1, bottom to top).
     * @returns Normalized direction vector in world space.
     * @throws Never throws.
     */
    protected screenCoordToWorldDir(x: number, y: number): vec3 {
        // Orthographic rays are parallel and look straight down.
        if (this.orthographic) return vec3.fromValues(0, 0, -1);
        // The same orthonormal basis `mat4.lookAt` builds for rendering, so a ray
        // through a screen position matches what is drawn there even when the
        // supplied up vector is not perpendicular to the view direction or not unit
        // length. The stored view direction is used for the forward axis: the
        // look-at point can sit only one unit from the eye, which float32 loses at
        // large heights.
        const forward = vec3.normalize(vec3.create(), this.wEyeDir);
        const right = vec3.normalize(vec3.create(), vec3.cross(vec3.create(), forward, this.wUp));
        const up = vec3.cross(vec3.create(), right, forward);
        const halfHeight = Math.tan(this.fovy / 2);
        const aspect = this.viewportWidth / this.viewportHeight;
        const dir = vec3.clone(forward);
        vec3.scaleAndAdd(dir, dir, up, halfHeight * (y - 0.5) * 2);
        vec3.scaleAndAdd(dir, dir, right, halfHeight * (x - 0.5) * 2 * aspect);
        vec3.normalize(dir, dir);
        return dir;
    }

    /**
     * Recomputes the normalized eye direction from current eye and look-at.
     *
     * @throws Never throws.
     */
    protected updateEyeDirAndLen(): void {
        this.wEyeDir = vec3.create();
        vec3.sub(this.wEyeDir, this.wLookAt, this.wEye);
        vec3.normalize(this.wEyeDir, this.wEyeDir);
    }
}

/** Keeps the part of a convex polygon where `value(p) >= 0` (Sutherland–Hodgman, one half-plane). */
function clipPolygon(polygon: ReadonlyArray<[number, number]>, value: (p: [number, number]) => number): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i] as [number, number];
        const b = polygon[(i + 1) % polygon.length] as [number, number];
        const va = value(a);
        const vb = value(b);
        if (va >= 0) out.push(a);
        if ((va >= 0) !== (vb >= 0)) {
            const t = va / (va - vb);
            out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
    }
    return out;
}
