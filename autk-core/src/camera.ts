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

    private static defaultParams: CameraData = {
        up: [0, 1, 0],
        eye: [0, 0, 10000],
        lookAt: [0, 0, 0],
    };

    /**
     * Creates a camera with the provided initial state.
     *
     * When omitted, the camera starts above the origin looking at the world
     * center with a world-up vector of `[0, 1, 0]`.
     *
     * @param params - Initial camera position and orientation.
     */
    constructor(params: CameraData = Camera.defaultParams) {
        this.resetCamera(params.up, params.lookAt, params.eye);
    }

    /**
     * Resets the camera to a new position and orientation.
     *
     * This also restores the default field of view and clipping planes and
     * clears the cached matrices so the next {@link Camera.update} call
     * rebuilds them from the new state.
     *
     * @param wUp - World-space up vector.
     * @param wLookAt - Point to look at in world space.
     * @param wEye - Eye position in world space.
     */
    public resetCamera(wUp: number[], wLookAt: number[], wEye: number[]): void {
        this.fovy = (45 * Math.PI) / 180.0;
        this.mProjectionMatrix = mat4.create();
        this.mViewMatrix = mat4.create();
        this.wNear = 1;
        this.wFar = 5e5;
        this.wLookAt = vec3.fromValues(wLookAt[0], wLookAt[1], wLookAt[2]);
        this.wEye = vec3.fromValues(wEye[0], wEye[1], wEye[2]);
        this.updateEyeDirAndLen();
        this.wUp = vec3.fromValues(wUp[0], wUp[1], wUp[2]);
    }

    /**
     * Returns the current projection matrix.
     *
     * Call {@link Camera.update} first if the camera state or viewport has
     * changed.
     */
    public getProjectionMatrix(): mat4 {
        return this.mProjectionMatrix;
    }

    /**
     * Returns the current view matrix.
     *
     * Call {@link Camera.update} first if the camera state or viewport has
     * changed.
     */
    public getModelViewMatrix(): mat4 {
        return this.mViewMatrix;
    }

    /**
     * Updates the viewport dimensions and recomputes the view and projection matrices.
     *
     * The viewport aspect ratio is derived from the supplied width and height,
     * so callers should pass the drawable canvas size rather than CSS size.
     *
     * @param width - Viewport width in pixels.
     * @param height - Viewport height in pixels.
     */
    public resize(width: number, height: number): void {
        this.viewportWidth = width;
        this.viewportHeight = height;
        this.update();
    }

    /**
     * Zooms the camera toward or away from the point under the cursor.
     *
     * The zoom target is derived from the normalized screen position, so the
     * motion preserves the point under the cursor in world space.
     *
     * @param delta - Normalized scroll delta. Positive values zoom out and
     *   negative values zoom in.
     * @param x - Normalized cursor X position (0–1, left to right).
     * @param y - Normalized cursor Y position (0–1, bottom to top).
     */
    public zoom(delta: number, x: number, y: number): void {
        const zoomScale = Math.max(Math.abs(this.wEye[2]), 1) * 0.2;
        delta = -delta * zoomScale;
        const dir = this.screenCoordToWorldDir(x, y);
        vec3.scaleAndAdd(this.wEye, this.wEye, dir, delta);
        vec3.scaleAndAdd(this.wLookAt, this.wEye, this.wEyeDir, vec3.length(this.wEyeDir));
    }

    /**
     * Pans the camera in the view plane by a normalized screen-space offset.
     *
     * The translation is expressed in world units relative to the current
     * camera distance, so the visible scene moves consistently as you zoom.
     *
     * @param dx - Normalized horizontal drag delta (0–1).
     * @param dy - Normalized vertical drag delta (0–1).
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
     * Recomputes the view and projection matrices from the current camera state.
     *
     * The projection uses reversed-Z depth mapping (`near` and `far` are passed
     * to the perspective helper in swapped order) to improve depth precision at
     * long range. Call this after changing camera navigation state or the
     * viewport size.
     */
    public update(): void {
        const aspect = this.viewportWidth / this.viewportHeight;
        mat4.lookAt(this.mViewMatrix, this.wEye, this.wLookAt, this.wUp);
        // Reversed-Z: swap near/far so near→1 and far→0 in NDC.
        // Combined with depthClearValue=0 and depthCompare='greater-equal' this
        // distributes float32 precision logarithmically, eliminating z-fighting
        // at distance without requiring an absurdly large far plane.
        mat4.perspectiveZO(this.mProjectionMatrix, this.fovy, aspect, this.wFar, this.wNear);
    }

    /**
     * Builds a combined view-projection matrix from explicit camera parameters.
     *
     * This helper is stateless and does not update any `Camera` instance. It is
     * useful when a caller needs a single matrix for compute or upload paths.
     *
     * @param p - Camera and projection parameters.
     * @returns A column-major `Float32Array` of length 16.
     */
    public static buildViewProjection(p: ViewProjectionParams): Float32Array {
        const view = mat4.lookAt(mat4.create(), p.eye, p.lookAt, p.up);
        const proj = mat4.perspectiveZO(mat4.create(), p.fovDeg * (Math.PI / 180), p.aspect, p.near, p.far);
        return new Float32Array(mat4.mul(mat4.create(), proj, view));
    }

    /**
     * Converts a normalized screen coordinate to a world-space direction vector.
     *
     * The result points from the camera eye through the given screen position
     * using the current field of view, aspect ratio, and orientation vectors.
     *
     * @param x - Normalized screen X (0–1, left to right).
     * @param y - Normalized screen Y (0–1, bottom to top).
     * @returns Normalized direction vector in world space.
     */
    protected screenCoordToWorldDir(x: number, y: number): vec3 {
        const wRight = vec3.create();
        vec3.normalize(wRight, vec3.cross(wRight, this.wEyeDir, this.wUp));
        const upOffset = vec3.scale(vec3.create(), this.wUp, Math.tan(this.fovy / 2) * (y - 0.5) * 2);
        const aspect = this.viewportWidth / this.viewportHeight;
        const rightOffset = vec3.scale(vec3.create(), wRight, Math.tan(this.fovy / 2) * (x - 0.5) * 2 * aspect);
        const offset = vec3.add(vec3.create(), upOffset, rightOffset);
        const dir = vec3.add(vec3.create(), this.wEyeDir, offset);
        vec3.normalize(dir, dir);
        return dir;
    }

    /**
     * Recomputes the normalized eye direction from the current eye and look-at positions.
     *
     * This is used when the camera state is reset so dependent navigation logic
     * starts from a consistent direction vector.
     */
    protected updateEyeDirAndLen(): void {
        this.wEyeDir = vec3.create();
        vec3.sub(this.wEyeDir, this.wLookAt, this.wEye);
        vec3.normalize(this.wEyeDir, this.wEyeDir);
    }
}
