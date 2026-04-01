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
