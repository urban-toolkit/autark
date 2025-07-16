import { vec3, mat4 } from 'gl-matrix';
import { ICameraData } from './interfaces';

/**
 * Camera class for managing the view parameters and transformations in a 3D space.
 * It provides methods to manipulate the camera position, orientation, and projection.
 */
export class Camera {
    /**
     * The world eye position of the camera.
     */
    protected wEye: vec3 = vec3.create();
    /**
     * The world look-at position of the camera.
     */
    protected wLookAt: vec3 = vec3.create();

    /**
     * The world eye direction vector of the camera.
     */
    protected wEyeDir: vec3 = vec3.create();
    /**
     * The world up vector of the camera.
     */
    protected wUp: vec3 = vec3.create();

    /**
     * The near clipping plane distance.
     */
    protected wNear: number = 0;
    /**
     * The far clipping plane distance.
     */
    protected wFar: number = 0;

    /**
     * The field of view angle in the y direction.
     */
    protected fovy = (45 * Math.PI) / 180.0;

    /**
     * The projection matrix for the camera.
     */
    protected mProjectionMatrix: mat4 = mat4.create();

    /**
     * The view matrix for the camera.
     */
    protected mViewMatrix: mat4 = mat4.create();

    /**
     * The model matrix for the camera.
     */
    protected mModelMatrix: mat4 = mat4.create();

    /**
     * The width of the viewport.
     */
    private viewportWidth: number = 0;

    /**
     * The height of the viewport.
     */
    private viewportHeight: number = 0;

    /**
     * Default camera parameters.
     */
    private static defaultParams: ICameraData = {
        up: [0, 1, 0],
        eye: [0, 0, 5000],
        lookAt: [0, 0, 0],
    };

    /**
     * Constructs a Camera instance with the specified parameters.
     * If no parameters are provided, it uses the default camera parameters.
     * 
     * @param {ICameraData} [params=Camera.defaultParams] - The initial camera parameters.
     */
    constructor(params: ICameraData = Camera.defaultParams) {
        this.resetCamera(params.up, params.lookAt, params.eye);
    }

    /**
     * Resets the camera to the initial position and orientation.
     * 
     * @param {number[]} wUp - The up vector of the camera in world coordinates.
     * @param {number[]} wLookAt - The look-at point of the camera in world coordinates.
     * @param {number[]} wEye - The eye position of the camera in world coordinates.
     */
    public resetCamera(wUp: number[], wLookAt: number[], wEye: number[]): void {
        this.fovy = (45 * Math.PI) / 180.0;
        this.mProjectionMatrix = mat4.create();
        this.mViewMatrix = mat4.create();
        this.mModelMatrix = mat4.create();

        this.wNear = 1;
        this.wFar = 1e10;

        this.wLookAt = vec3.fromValues(wLookAt[0], wLookAt[1], wLookAt[2]);
        this.wEye = vec3.fromValues(wEye[0], wEye[1], wEye[2]);

        this.updateEyeDirAndLen();
        this.wUp = vec3.fromValues(wUp[0], wUp[1], wUp[2]);
    }

    /**
     * Gets the projection matrix for the camera.
     * @returns {Float32Array | number[]} The projection matrix
     */
    public getProjectionMatrix(): Float32Array | number[] {
        return Array.from(this.mProjectionMatrix);
    }

    /**
     * Gets the model-view matrix for the camera.
     * @returns {Float32Array | number[]} The model-view matrix
     */
    public getModelViewMatrix(): Float32Array | number[] {
        const modelViewMatrix = mat4.mul(mat4.create(), this.mViewMatrix, this.mModelMatrix);
        return Array.from(modelViewMatrix);
    }

    /**
     * Resizes the viewport for the camera.
     * @param {number} width - The new width of the viewport.
     * @param {number} height - The new height of the viewport.
     */
    public resize(width: number, height: number): void {
        this.viewportWidth = width;
        this.viewportHeight = height;

        this.update();
    }

    /**
     * Zooms the camera in or out based on the specified delta and screen coordinates.
     * @param {number} delta - The zoom factor (positive to zoom in, negative to zoom out).
     * @param {number} x - The x-coordinate on the screen where the zoom is centered.
     * @param {number} y - The y-coordinate on the screen where the zoom is centered.
     */
    public zoom(delta: number, x: number, y: number): void {
        delta = delta < 0 ? 100 * (this.wEye[2] * 0.001) : -100 * (this.wEye[2] * 0.001);

        const dir = this.screenCoordToWorldDir(x, y);

        vec3.scaleAndAdd(this.wEye, this.wEye, dir, delta);
        vec3.scaleAndAdd(this.wLookAt, this.wEye, this.wEyeDir, vec3.length(this.wEyeDir));
    }

    /**
     * Translates the camera position by the specified delta values in the x and y directions.
     * The translation is scaled by the current eye distance to maintain consistent movement speed.
     * 
     * @param {number} dx - The translation distance in the x direction.
     * @param {number} dy - The translation distance in the y direction.
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
     * Yaws the camera around the z-axis.
     * @param {number} delta - The amount to yaw the camera (in radians).
     */
    public yaw(delta: number): void {
        vec3.rotateZ(this.wEyeDir, this.wEyeDir, vec3.fromValues(0, 0, 0), delta);
        vec3.rotateZ(this.wUp, this.wUp, vec3.fromValues(0, 0, 0), delta);

        vec3.scaleAndAdd(this.wLookAt, this.wEye, this.wEyeDir, vec3.length(this.wEyeDir));
    }

    /**
     * Pitches the camera around the x-axis.
     * @param {number} delta - The amount to pitch the camera (in radians).
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
     * Updates the camera's view and projection matrices.
     */
    public update(): void {
        const aspect = this.viewportWidth / this.viewportHeight;

        // model matrix
        this.mModelMatrix = mat4.fromScaling(mat4.create(), vec3.fromValues(1, 1, 1));
        // view matrix
        mat4.lookAt(this.mViewMatrix, this.wEye, this.wLookAt, this.wUp);
        // projection matrix
        mat4.perspectiveZO(this.mProjectionMatrix, this.fovy, aspect, this.wNear, this.wFar);
    }

    /**
     * Converts screen coordinates to world direction vector.
     * @param {number} x - The x-coordinate on the screen.
     * @param {number} y - The y-coordinate on the screen.
     * @returns {vec3} The direction vector in world coordinates.
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
     * Updates the eye direction and length based on the current eye and look-at positions.
     */
    protected updateEyeDirAndLen(): void {
        this.wEyeDir = vec3.create();
        vec3.sub(this.wEyeDir, this.wLookAt, this.wEye);
        vec3.normalize(this.wEyeDir, this.wEyeDir);
    }
}
