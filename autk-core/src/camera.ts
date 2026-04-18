import { vec3, mat4 } from 'gl-matrix';

/**
 * Initialisation parameters for the interactive map camera.
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
 * Parameters for building a one-shot view-projection matrix,
 * typically used in the GPU compute pipeline.
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
 * Interactive 3-DOF map camera supporting zoom, pan, yaw, and pitch.
 *
 * Maintains a view matrix and a projection matrix that are updated whenever
 * the viewport is resized or {@link Camera.update} is called. Subclasses can
 * access the protected camera state to extend or override behaviour.
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
     * @param params - Initial camera position and orientation.
     *   Defaults to a top-down view at height 10 000.
     */
    constructor(params: CameraData = Camera.defaultParams) {
        this.resetCamera(params.up, params.lookAt, params.eye);
    }

    /**
     * Resets the camera to a new position and orientation.
     * Restores the default FOV and clipping planes.
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
     */
    public getProjectionMatrix(): mat4 {
        return this.mProjectionMatrix;
    }

    /**
     * Returns the current view matrix.
     */
    public getModelViewMatrix(): mat4 {
        return this.mViewMatrix;
    }

    /**
     * Updates the viewport dimensions and recomputes the view and projection matrices.
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
     * @param delta - Scroll delta — negative scrolls zoom out, positive zooms in.
     * @param x - Normalised cursor X position (0–1, left to right).
     * @param y - Normalised cursor Y position (0–1, bottom to top).
     */
    public zoom(delta: number, x: number, y: number): void {
        delta = delta < 0 ? 100 * (this.wEye[2] * 0.001) : -100 * (this.wEye[2] * 0.001);
        const dir = this.screenCoordToWorldDir(x, y);
        vec3.scaleAndAdd(this.wEye, this.wEye, dir, delta);
        vec3.scaleAndAdd(this.wLookAt, this.wEye, this.wEyeDir, vec3.length(this.wEyeDir));
    }

    /**
     * Pans the camera in the view plane by a normalised screen-space offset.
     *
     * @param dx - Normalised horizontal drag delta (0–1).
     * @param dy - Normalised vertical drag delta (0–1).
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
     * Called automatically by {@link Camera.resize}; call manually after
     * {@link Camera.zoom}, {@link Camera.translate}, {@link Camera.yaw}, or
     * {@link Camera.pitch} to apply changes.
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
     * Uses a WebGPU-compatible depth range (Z maps to [0, 1]).
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
     * Converts a normalised screen coordinate to a world-space direction vector.
     *
     * @param x - Normalised screen X (0–1, left to right).
     * @param y - Normalised screen Y (0–1, bottom to top).
     * @returns Normalised direction vector in world space.
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
     * Recomputes {@link Camera.wEyeDir} from the current eye and look-at positions.
     */
    protected updateEyeDirAndLen(): void {
        this.wEyeDir = vec3.create();
        vec3.sub(this.wEyeDir, this.wLookAt, this.wEye);
        vec3.normalize(this.wEyeDir, this.wEyeDir);
    }
}
