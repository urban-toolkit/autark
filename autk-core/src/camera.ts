import { vec3, mat4 } from 'gl-matrix';

/** Camera initialisation parameters for the interactive map camera. */
export interface CameraData {
    up: number[];
    eye: number[];
    lookAt: number[];
}

/** Parameters for building a view-projection matrix in the GPU compute pipeline. */
export interface ViewProjectionParams {
    eye:    [number, number, number];
    lookAt: [number, number, number];
    up:     [number, number, number];
    fovDeg: number;
    aspect: number;
    near:   number;
    far:    number;
}

/**
 * Builds a combined view-projection matrix (column-major Float32Array[16]).
 * Uses perspectiveZO (Z maps to [0,1]) as required by WebGPU.
 */
export function buildViewProjection(p: ViewProjectionParams): Float32Array {
    const view = mat4LookAt(p.eye, p.lookAt, p.up);
    const proj = mat4PerspectiveZO(p.fovDeg * (Math.PI / 180), p.aspect, p.near, p.far);
    return mat4Multiply(proj, view);
}

// ── Internal matrix math ─────────────────────────────────────────────────────

function mat4LookAt(
    eye:    [number, number, number],
    center: [number, number, number],
    up:     [number, number, number],
): Float32Array {
    const ex = eye[0], ey = eye[1], ez = eye[2];

    let z0 = ex - center[0], z1 = ey - center[1], z2 = ez - center[2];
    let len = Math.sqrt(z0*z0 + z1*z1 + z2*z2);
    if (len > 0) { z0 /= len; z1 /= len; z2 /= len; }

    let x0 = up[1]*z2 - up[2]*z1;
    let x1 = up[2]*z0 - up[0]*z2;
    let x2 = up[0]*z1 - up[1]*z0;
    len = Math.sqrt(x0*x0 + x1*x1 + x2*x2);
    if (len > 0) { x0 /= len; x1 /= len; x2 /= len; }

    let y0 = z1*x2 - z2*x1;
    let y1 = z2*x0 - z0*x2;
    let y2 = z0*x1 - z1*x0;
    len = Math.sqrt(y0*y0 + y1*y1 + y2*y2);
    if (len > 0) { y0 /= len; y1 /= len; y2 /= len; }

    const out = new Float32Array(16);
    out[0] = x0;  out[1] = y0;  out[2] = z0;  out[3] = 0;
    out[4] = x1;  out[5] = y1;  out[6] = z1;  out[7] = 0;
    out[8] = x2;  out[9] = y2;  out[10] = z2; out[11] = 0;
    out[12] = -(x0*ex + x1*ey + x2*ez);
    out[13] = -(y0*ex + y1*ey + y2*ez);
    out[14] = -(z0*ex + z1*ey + z2*ez);
    out[15] = 1;
    return out;
}

function mat4PerspectiveZO(fovY: number, aspect: number, near: number, far: number): Float32Array {
    const f  = 1.0 / Math.tan(fovY / 2);
    const nf = 1 / (near - far);
    const out = new Float32Array(16);
    out[0]  = f / aspect;
    out[5]  = f;
    out[10] = far * nf;
    out[11] = -1;
    out[14] = far * near * nf;
    return out;
}

function mat4Multiply(a: Float32Array, b: Float32Array): Float32Array {
    const out = new Float32Array(16);
    for (let col = 0; col < 4; col++) {
        for (let row = 0; row < 4; row++) {
            let sum = 0;
            for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
            out[col * 4 + row] = sum;
        }
    }
    return out;
}

// ── Interactive map camera ────────────────────────────────────────────────────

export class Camera {
    protected wEye: vec3 = vec3.create();
    protected wLookAt: vec3 = vec3.create();
    protected wEyeDir: vec3 = vec3.create();
    protected wUp: vec3 = vec3.create();
    protected wNear: number = 0;
    protected wFar: number = 0;
    protected fovy = (45 * Math.PI) / 180.0;
    protected mProjectionMatrix: mat4 = mat4.create();
    protected mViewMatrix: mat4 = mat4.create();
    protected mModelMatrix: mat4 = mat4.create();
    private viewportWidth: number = 0;
    private viewportHeight: number = 0;

    private static defaultParams: CameraData = {
        up: [0, 1, 0],
        eye: [0, 0, 10000],
        lookAt: [0, 0, 0],
    };

    constructor(params: CameraData = Camera.defaultParams) {
        this.resetCamera(params.up, params.lookAt, params.eye);
    }

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

    public getProjectionMatrix(): Float32Array | number[] {
        return Array.from(this.mProjectionMatrix);
    }

    public getModelViewMatrix(): Float32Array | number[] {
        const modelViewMatrix = mat4.mul(mat4.create(), this.mViewMatrix, this.mModelMatrix);
        return Array.from(modelViewMatrix);
    }

    public resize(width: number, height: number): void {
        this.viewportWidth = width;
        this.viewportHeight = height;
        this.update();
    }

    public zoom(delta: number, x: number, y: number): void {
        delta = delta < 0 ? 100 * (this.wEye[2] * 0.001) : -100 * (this.wEye[2] * 0.001);
        const dir = this.screenCoordToWorldDir(x, y);
        vec3.scaleAndAdd(this.wEye, this.wEye, dir, delta);
        vec3.scaleAndAdd(this.wLookAt, this.wEye, this.wEyeDir, vec3.length(this.wEyeDir));
    }

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

    public yaw(delta: number): void {
        vec3.rotateZ(this.wEyeDir, this.wEyeDir, vec3.fromValues(0, 0, 0), delta);
        vec3.rotateZ(this.wUp, this.wUp, vec3.fromValues(0, 0, 0), delta);
        vec3.scaleAndAdd(this.wLookAt, this.wEye, this.wEyeDir, vec3.length(this.wEyeDir));
    }

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

    public update(): void {
        const aspect = this.viewportWidth / this.viewportHeight;
        this.mModelMatrix = mat4.fromScaling(mat4.create(), vec3.fromValues(1, 1, 1));
        mat4.lookAt(this.mViewMatrix, this.wEye, this.wLookAt, this.wUp);
        mat4.perspectiveZO(this.mProjectionMatrix, this.fovy, aspect, this.wNear, this.wFar);
    }

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

    protected updateEyeDirAndLen(): void {
        this.wEyeDir = vec3.create();
        vec3.sub(this.wEyeDir, this.wLookAt, this.wEye);
        vec3.normalize(this.wEyeDir, this.wEyeDir);
    }
}
