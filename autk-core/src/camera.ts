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
 * How a camera projects the scene: `'perspective'`, where farther things look
 * smaller, or `'orthographic'`, where parallel rays draw every distance at one
 * scale.
 */
export type CameraProjection = 'perspective' | 'orthographic';

/** Serializable camera snapshot. Viewport dimensions and the map origin are not part of the snapshot. */
export interface CameraState extends CameraData {
    /** Persistent projection; fixed bounds override it until the next reset. */
    projection: CameraProjection;
    /** World-space forward vector, retained separately from the rounded look-at point. */
    direction: [number, number, number];
    /** View scale as the framing distance, independent of the stored look-at point. */
    framingDistance: number;
    fovyRadians: number;
    near: number;
    far: number;
    /** Optional override for a fixed top-down orthographic view. */
    orthographicBounds: { left: number; right: number; bottom: number; top: number } | null;
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
    /**
     * Distance from the eye to the point it looks at, which sizes an
     * orthographic view independently of depth clipping and places the point
     * {@link getLookAt} gives in one. {@link resetCamera} sets it, a zoom
     * changes it, and a pan or a tilt keeps it, though those moves leave
     * `wLookAt` one unit ahead of the eye.
     */
    private wLookAtDistance: number = 1;
    /** Vertical field of view in radians. */
    protected fovy = (45 * Math.PI) / 180.0;
    /** Current projection matrix. */
    protected mProjectionMatrix: mat4 = mat4.create();
    /** Current view matrix. */
    protected mViewMatrix: mat4 = mat4.create();
    private viewportWidth: number = 0;
    private viewportHeight: number = 0;
    /** Ground bounds of a top-down orthographic projection set by {@link setOrthographicBounds}, or `null`. */
    private orthographic: { left: number; right: number; bottom: number; top: number } | null = null;
    /** Projection kept through {@link update} and {@link resetCamera}, set by {@link setProjection}. */
    private projection: CameraProjection = 'perspective';

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
     * The projection set by {@link setProjection} is kept; the bounds set by
     * {@link setOrthographicBounds} end.
     *
     * @param wUp - World-space up vector.
     * @param wLookAt - Point to look at in world space.
     * @param wEye - Eye position in world space.
     * @param far - Minimum far clipping distance for navigable views; defaults to 500,000 world units.
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

    /**
     * Returns the point the camera looks at.
     *
     * `resetCamera(getUp(), getLookAt(), getEye())` keeps the view, in
     * perspective and in an orthographic view set with {@link setProjection}.
     *
     * @returns The point `[x, y, z]` in world space.
     * @throws Never throws.
     */
    public getLookAt(): [number, number, number] {
        if (this.projection === 'orthographic' && !this.orthographic) {
            // Zoom, pan and tilt leave wLookAt one unit ahead of the eye, nearer than the point the view is sized at.
            const distance = this.wLookAtDistance;
            return [0, 1, 2].map((i) => this.wEye[i] + this.wEyeDir[i] * distance) as [number, number, number];
        }
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

    /** Returns the active far distance for navigation, or the configured minimum in fixed-bounds mode. */
    public getFar(): number {
        if (this.orthographic) return this.wFar;
        const height = Math.abs(this.wEye[2]);
        const { forward, right, up } = this.viewBasis();
        const vertical = Math.abs(forward[2]);
        const aspect = this.viewportHeight > 0 ? this.viewportWidth / this.viewportHeight : 1;
        const verticalSpread = (Math.abs(up[2]) + aspect * Math.abs(right[2])) * Math.tan(this.fovy / 2);
        if (this.projection === 'orthographic') {
            const extent = this.wLookAtDistance;
            // Parallel rays start at different heights across the view. Bound the search near the horizon.
            const groundDepth = (height + extent * verticalSpread) / Math.max(vertical, 1 / 32);
            return Math.max(this.wFar, 4 * height, 2 * extent, 1.1 * groundDepth);
        }
        // At the far edge the ground can be much deeper than at the center. If the view
        // crosses the horizon, keep a finite fallback that covers the default tile footprint.
        const groundDepth = height / Math.max(vertical - verticalSpread, 1 / 32);
        return Math.max(this.wFar, 4 * height, 1.1 * groundDepth);
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

    /**
     * Returns the direction of the ray through a screen position, in world space.
     *
     * In perspective, the ray starts at the eye ({@link getEye}). In an
     * orthographic view, every ray has the view direction, and the ray through
     * a screen position starts at that position on the plane of the eye, not at
     * the eye: unproject the position with the inverse of
     * {@link getViewProjectionMatrix} to find a point on it, or use
     * {@link getGroundPoint} for where it meets the ground.
     *
     * @param x - Normalized screen X, from 0 at the left to 1 at the right.
     * @param y - Normalized screen Y, from 0 at the bottom to 1 at the top.
     * @returns The unit direction `[x, y, z]`.
     * @throws Never throws.
     */
    public getWorldRayDirection(x: number, y: number): [number, number, number] {
        const direction = this.screenCoordToWorldDir(x, y);
        return [direction[0], direction[1], direction[2]];
    }

    /**
     * Finds where the ray through a screen position meets the ground plane (`z = 0`).
     *
     * A ray that points away from the ground, or is parallel to it, has no hit;
     * a hit farther than `maxDistance` is too far to be useful. In both cases the
     * point `maxDistance` along the ray is returned instead. An orthographic
     * ray starts on the plane of the eye, and its hit may lie behind that plane;
     * a hit more than `maxDistance` behind it gives the point `maxDistance` behind it.
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
        if (this.projection === 'orthographic') {
            // The camera also draws the ground behind the plane of the eye, so a hit past maxDistance keeps its side.
            const [origin, direction] = this.orthographicRay(x, y);
            const groundDistance = Math.abs(direction[2]) > 1e-6 ? -origin[2] / direction[2] : Number.POSITIVE_INFINITY;
            const distance = Math.min(Math.max(groundDistance, -maxDistance), maxDistance);
            return [origin[0] + direction[0] * distance, origin[1] + direction[1] * distance];
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
     * ground. An orthographic view sees a parallelogram of ground, between the
     * ground points of its corners.
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
        if (this.projection === 'orthographic') {
            return ([[0, 0], [1, 0], [1, 1], [0, 1]] as const).map(([x, y]) => this.getGroundPoint(x, y, reach));
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
     * The camera keeps these bounds until {@link resetCamera} or
     * `setProjection('perspective')` is called: {@link resize} and {@link update} keep the
     * projection, and the ground and ray helpers follow the bounds. World `z`
     * from -10 to 90 is inside the depth range. Ordinary 2D layers remain on the
     * common ground plane and use drawing order. For a view that follows the
     * eye, use {@link setProjection}.
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
        this.wEye = vec3.fromValues((left + right) * 0.5, (bottom + top) * 0.5, 100);
        this.wLookAt = vec3.fromValues((left + right) * 0.5, (bottom + top) * 0.5, 0);
        this.wUp = vec3.fromValues(0, 1, 0);
        this.updateEyeDirAndLen();
        this.updateFixedProjection(this.orthographic);
    }

    private updateFixedProjection({ left, right, bottom, top }: NonNullable<CameraState['orthographicBounds']>): void {
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
    }

    /**
     * Sets the projection the camera keeps until it is set again.
     *
     * An orthographic camera looks along the same line as the perspective one,
     * with parallel rays, and at the point it looks at it shows what the
     * perspective camera shows there. So switching keeps the scale there, and
     * zoom, pan, tilt and {@link resetCamera} work as in perspective. It draws
     * everything within the far distance, in front of the eye or behind it.
     *
     * Setting the projection {@link getProjection} already reports changes
     * nothing that is drawn. While the bounds of {@link setOrthographicBounds}
     * hold, the camera is orthographic: `setProjection('orthographic')` keeps
     * them, and the camera stays orthographic after {@link resetCamera} ends
     * them; `setProjection('perspective')` ends them.
     *
     * @param projection - `'perspective'`, the default, or `'orthographic'`.
     * @throws Never throws.
     * @example
     * camera.setProjection('orthographic');
     */
    public setProjection(projection: CameraProjection): void {
        const unchanged = projection === this.getProjection();
        // Recorded also while fixed bounds already draw orthographically, so that it outlasts them.
        this.projection = projection;
        if (unchanged) return;
        this.orthographic = null;
        this.update();
    }

    /**
     * Returns the current projection.
     *
     * @returns `'orthographic'` once {@link setProjection} chose it, or while the
     * bounds of {@link setOrthographicBounds} hold; otherwise `'perspective'`.
     * @throws Never throws.
     */
    public getProjection(): CameraProjection {
        return this.orthographic ? 'orthographic' : this.projection;
    }

    /** Captures the pose, projection, framing, and clipping range as JSON-serializable data. */
    public saveState(): CameraState {
        return {
            projection: this.projection,
            eye: this.getEye(),
            lookAt: Array.from(this.wLookAt),
            up: this.getUp(),
            direction: [this.wEyeDir[0], this.wEyeDir[1], this.wEyeDir[2]],
            framingDistance: this.wLookAtDistance,
            fovyRadians: this.fovy,
            near: this.wNear,
            far: this.wFar,
            orthographicBounds: this.orthographic && { ...this.orthographic },
        };
    }

    /** Restores a snapshot from {@link saveState}, using the receiving camera's viewport. */
    public restoreState(state: CameraState): void {
        this.projection = state.projection;
        vec3.set(this.wEye, state.eye[0], state.eye[1], state.eye[2]);
        vec3.set(this.wLookAt, state.lookAt[0], state.lookAt[1], state.lookAt[2]);
        vec3.set(this.wUp, state.up[0], state.up[1], state.up[2]);
        vec3.set(this.wEyeDir, ...state.direction);
        this.wLookAtDistance = state.framingDistance;
        this.fovy = state.fovyRadians;
        this.wNear = state.near;
        this.wFar = state.far;
        this.orthographic = state.orthographicBounds && { ...state.orthographicBounds };
        if (this.orthographic) this.updateFixedProjection(this.orthographic);
        else if (this.viewportWidth > 0 && this.viewportHeight > 0) this.update();
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
        let dir = this.screenCoordToWorldDir(x, y);
        if (this.projection === 'orthographic' && !this.orthographic) {
            // Orthographic rays are parallel, so the eye moves toward the point under the cursor at the look-at distance.
            const [origin, forward] = this.orthographicRay(x, y);
            dir = vec3.normalize(vec3.create(), [0, 1, 2].map((i) => origin[i] + forward[i] * this.wLookAtDistance - this.wEye[i]));
        }
        vec3.scaleAndAdd(this.wEye, this.wEye, dir, delta);
        // The distance to the point looked at changes by as much as the eye moves along the view.
        this.wLookAtDistance = Math.max(this.wLookAtDistance - delta * vec3.dot(dir, this.wEyeDir), this.wNear);
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
        const far = this.getFar();
        // Build orientation from the stored direction: at large eye coordinates,
        // a look-at point one unit ahead can round back to the eye in float32.
        mat4.lookAt(this.mViewMatrix, [0, 0, 0], this.wEyeDir, this.wUp);
        mat4.translate(this.mViewMatrix, this.mViewMatrix, [-this.wEye[0], -this.wEye[1], -this.wEye[2]]);
        if (this.projection === 'orthographic') {
            const [halfWidth, halfHeight] = this.orthographicHalfSize();
            // Reversed-Z as below, over everything within the far distance in front of the eye or behind it.
            mat4.orthoZO(this.mProjectionMatrix, -halfWidth, halfWidth, -halfHeight, halfHeight, far, -far);
            return;
        }
        // Reversed-Z: swap near/far so near→1 and far→0 in NDC.
        // Combined with depthClearValue=0 and depthCompare='greater-equal' this
        // distributes float32 precision logarithmically, eliminating z-fighting
        // at distance without requiring an absurdly large far plane.
        mat4.perspectiveZO(this.mProjectionMatrix, this.fovy, aspect, far, this.wNear);
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
        const { forward, right, up } = this.viewBasis();
        // Orthographic rays are parallel to the view direction.
        if (this.projection === 'orthographic') return forward;
        const halfHeight = Math.tan(this.fovy / 2);
        const aspect = this.viewportWidth / this.viewportHeight;
        const dir = vec3.clone(forward);
        vec3.scaleAndAdd(dir, dir, up, halfHeight * (y - 0.5) * 2);
        vec3.scaleAndAdd(dir, dir, right, halfHeight * (x - 0.5) * 2 * aspect);
        vec3.normalize(dir, dir);
        return dir;
    }

    /**
     * Returns the view direction and the screen's right and up axes in world space.
     *
     * This is the orthonormal basis `mat4.lookAt` builds for rendering, so a ray
     * through a screen position matches what is drawn there even when the
     * supplied up vector is not perpendicular to the view direction or not unit
     * length. The stored view direction is used for the forward axis: the
     * look-at point can sit only one unit from the eye, which float32 loses at
     * large heights.
     *
     * @returns Unit `forward`, `right` and `up` vectors.
     */
    private viewBasis(): { forward: vec3; right: vec3; up: vec3 } {
        const forward = vec3.normalize(vec3.create(), this.wEyeDir);
        const right = vec3.normalize(vec3.create(), vec3.cross(vec3.create(), forward, this.wUp));
        const up = vec3.cross(vec3.create(), right, forward);
        return { forward, right, up };
    }

    /**
     * Returns half the width and height of the view that {@link setProjection} makes orthographic.
     *
     * They are those of the perspective view at the point the camera looks at,
     * from the eye's distance to that point, which a zoom changes and a pan or a
     * tilt keeps.
     *
     * @returns `[halfWidth, halfHeight]` in world units.
     */
    private orthographicHalfSize(): [number, number] {
        const halfHeight = this.wLookAtDistance * Math.tan(this.fovy / 2);
        return [halfHeight * (this.viewportWidth / this.viewportHeight), halfHeight];
    }

    /**
     * Returns the parallel ray of the orthographic view through a screen position.
     *
     * @param x - Normalized screen X, from 0 at the left to 1 at the right.
     * @param y - Normalized screen Y, from 0 at the bottom to 1 at the top.
     * @returns The ray's start on the plane of the eye, and its unit direction, the view direction.
     */
    private orthographicRay(x: number, y: number): [number[], vec3] {
        const [halfWidth, halfHeight] = this.orthographicHalfSize();
        const { forward, right, up } = this.viewBasis();
        const across = (x * 2 - 1) * halfWidth;
        const along = (y * 2 - 1) * halfHeight;
        return [[0, 1, 2].map((i) => this.wEye[i] + right[i] * across + up[i] * along), forward];
    }

    /**
     * Recomputes the normalized eye direction, and the distance to the look-at
     * point, from current eye and look-at.
     *
     * @throws Never throws.
     */
    protected updateEyeDirAndLen(): void {
        this.wEyeDir = vec3.create();
        vec3.sub(this.wEyeDir, this.wLookAt, this.wEye);
        this.wLookAtDistance = Math.max(vec3.length(this.wEyeDir), this.wNear);
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
