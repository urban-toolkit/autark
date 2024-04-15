import { GeoUtils } from './geo-utils';
import { vec2, vec3, mat4 } from 'gl-matrix';
import { ICameraData } from './interfaces';

export class Camera {
    // View parameters
    protected wOrigin: vec2 = vec2.create();
    protected wEye: vec3 = vec3.create();
    protected wEyeDir: vec3 = vec3.create();
    protected wEyeLength: number = 0;
    protected wLookAt: vec3 = vec3.create();
    protected wUp: vec3 = vec3.create();
    protected wNear: number = 0;
    protected wFar: number = 0;

    // 1 unit in worldspace equals to {groundRes} meters in the z-axis
    protected groundRes: number = 0;
    protected fovy = 45 * Math.PI / 180.0;

    // Transformation matrices
    protected mProjectionMatrix: mat4 = mat4.create();
    protected mViewMatrix: mat4 = mat4.create();
    protected mModelMatrix: mat4 = mat4.create();

    protected _updateStatusCallback: any;

    // view resolution
    private viewportWidth: number = 0;
    private viewportHeight: number = 0;

    private static defaultParams: ICameraData = {
        origin: [0, 0, 0],
        direction: {
            up: [0, 1, 0],
            eye: [0, 0, 1000],
            lookAt: [0, 0, 0]
        }
    }

    constructor(params: ICameraData = Camera.defaultParams) {
        this.resetCamera(params.origin, params.direction.up, params.direction.lookAt, params.direction.eye);
    }

    resetCamera(initialPosition: number[], wUp: number[], wLookAt: number[], wEye: number[]): void {
        this.wEyeDir = vec3.create();
        this.fovy = 45 * Math.PI / 180.0;
        this.mProjectionMatrix = mat4.create();
        this.mViewMatrix = mat4.create();
        this.mModelMatrix = mat4.create();

        // z-values start from here are in meters
        this.wNear = 0;
        this.wFar = 1e10;

        this.groundRes = 1;

        this.wOrigin = vec2.fromValues(initialPosition[0], initialPosition[1]);
        this.wLookAt = vec3.fromValues(wLookAt[0], wLookAt[1], wLookAt[2]);
        this.wEye = vec3.fromValues(wEye[0], wEye[1], wEye[2]);
        this.zScaling(1);

        // meter is no longer used in the remaining code
        this.wUp = vec3.fromValues(wUp[0], wUp[1], wUp[2]);

        // ============ manhattan
        // this.wEye = vec3.fromValues(3373.32275390625, -3327.14892578125, 4355.8701171875);
        // this.wLookAt = vec3.fromValues(2775.06201171875, -2736.633056640625, 3814.228759765625);
        // this.wUp = vec3.fromValues(-0.3854859173297882, 0.38049426674842834, 0.8406097292900085);
        // ============ manhattan
        // this.wEye = vec3.fromValues(25.537822723388672, 44.76106262207031, 1299.8607177734375);
        // this.wLookAt = vec3.fromValues(572.3938598632812, -504.5278625488281, 668.0140380859375);
        // this.wUp = vec3.fromValues(0.4457886517047882, -0.4477752149105072, 0.7750934362411499);
        // ============ chicago
        // this.wEye = vec3.fromValues(-18.267929077148438, 759.4937744140625, 3000);
        // this.wLookAt = vec3.fromValues(-18.316102981567383, 747.6268310546875, 0.023424625396728516);
        // this.wUp = vec3.fromValues(0.004059492610394955, 0.9999839067459106, -0.0039556859992444515);
    }

    getProjectionMatrix(): Float32Array | number[] {
        return this.mProjectionMatrix;
    }

    getViewMatrix(): Float32Array | number[] {
        return this.mViewMatrix;
    }

    getModelViewMatrix(): Float32Array | number[] {
        const modelViewMatrix = mat4.mul(mat4.create(), this.mViewMatrix, this.mModelMatrix);
        return modelViewMatrix;
    }

    getWorldOrigin(): Float32Array | number[] {
        return this.wOrigin;
    }

    getEye(): Float32Array | number[] {
        return this.wEye;
    }

    getGroundResolution(): number {
        return this.groundRes;
    }

    getUpVector(): vec3 {
        return this.wUp;
    }

    getRightVector(): vec3 {
        const wRight = vec3.create();
        vec3.normalize(wRight, vec3.cross(wRight, this.wEyeDir, this.wUp));

        return wRight;
    }

    getZoomLevel() {
        return this.wEye[2] / 1000;
    }

    getViewportResolution(): number[] {
        return [
            this.viewportWidth,
            this.viewportHeight
        ];
    }

    setViewportResolution(x: number, y: number): void {
        this.viewportWidth = x;
        this.viewportHeight = y;
    }

    setPosition(x: number, y: number): void {
        let newEye = [x - this.wOrigin[0], y - this.wOrigin[1]];
        vec3.add(this.wEye, this.wEye, [newEye[0] - this.wEye[0], newEye[1] - this.wEye[1], 0]);
        vec3.scaleAndAdd(this.wLookAt, this.wEye, this.wEyeDir, this.wEyeLength);
    }

    updateEyeDirAndLen(): void {
        vec3.sub(this.wEyeDir, this.wLookAt, this.wEye);
        this.wEyeLength = vec3.length(this.wEyeDir);
        vec3.normalize(this.wEyeDir, this.wEyeDir);
    }

    zScaling(scale: number): void {
        this.wEye[2] = this.wEye[2] * scale;
        this.wLookAt[2] = this.wLookAt[2] * scale;

        this.updateEyeDirAndLen();
    }

    zoom(delta: number, x: number, y: number): void {
        delta = delta < 0 ? 100 * (this.wEye[2] * 0.001) : -100 * (this.wEye[2] * 0.001);

        const dir = this.screenCoordToWorldDir(x, y);

        vec3.scaleAndAdd(this.wEye, this.wEye, dir, delta);
        vec3.scaleAndAdd(this.wLookAt, this.wEye, this.wEyeDir, this.wEyeLength);
    }

    translate(dx: number, dy: number): void {
        const scale = this.wEye[2];
        const X = vec3.create();
        vec3.normalize(X, vec3.cross(X, this.wEyeDir, this.wUp));

        const D = vec3.add(vec3.create(), vec3.scale(vec3.create(), X, dx * scale), vec3.scale(vec3.create(), this.wUp, dy * scale));
        vec3.add(this.wEye, this.wEye, D);

        vec3.scaleAndAdd(this.wLookAt, this.wEye, this.wEyeDir, this.wEyeLength);
    }

    yaw(delta: number): void {
        vec3.rotateZ(this.wEyeDir, this.wEyeDir, vec3.fromValues(0, 0, 0), delta);
        vec3.rotateZ(this.wUp, this.wUp, vec3.fromValues(0, 0, 0), delta);

        vec3.scaleAndAdd(this.wLookAt, this.wEye, this.wEyeDir, this.wEyeLength);
    }

    pitch(delta: number): void {
        delta = -delta;
        vec3.add(this.wEyeDir, vec3.scale(vec3.create(), this.wUp, Math.sin(delta)), vec3.scale(vec3.create(), this.wEyeDir, Math.cos(delta)));
        vec3.normalize(this.wEyeDir, this.wEyeDir);

        vec3.scaleAndAdd(this.wLookAt, this.wEye, this.wEyeDir, this.wEyeLength);

        vec3.cross(this.wUp, vec3.cross(vec3.create(), this.wEyeDir, this.wUp), this.wEyeDir);
        vec3.normalize(this.wUp, this.wUp);
    }

    update(): void {
        // model matrix
        this.mModelMatrix = mat4.fromScaling(mat4.create(), vec3.fromValues(1, 1, 1 / this.groundRes));
        // view matrix
        mat4.lookAt(this.mViewMatrix, this.wEye, this.wLookAt, this.wUp);
        // projection matrix
        mat4.perspectiveZO(this.mProjectionMatrix, this.fovy, 1, this.wNear, this.wFar);
    }

    loadPosition(state: any): void {
        const stateObj = JSON.parse(state);

        const oData: number[] = Object.values(stateObj.wOrigin);
        const viewData: number[] = Object.values(stateObj.mViewMatrix);
        const modelData: number[] = Object.values(stateObj.mModelMatrix);
        const projData: number[] = Object.values(stateObj.mProjectionMatrix);

        this.mViewMatrix = mat4.create();
        mat4.set(this.mViewMatrix,
            viewData[0], viewData[1], viewData[2], viewData[3],
            viewData[4], viewData[5], viewData[6], viewData[7],
            viewData[8], viewData[9], viewData[10], viewData[11],
            viewData[12], viewData[13], viewData[14], viewData[15]
        );

        this.mModelMatrix = mat4.create();
        mat4.set(this.mModelMatrix,
            modelData[0], modelData[1], modelData[2], modelData[3],
            modelData[4], modelData[5], modelData[6], modelData[7],
            modelData[8], modelData[9], modelData[10], modelData[11],
            modelData[12], modelData[13], modelData[14], modelData[15]
        );

        this.mProjectionMatrix = mat4.create();
        mat4.set(this.mProjectionMatrix,
            projData[0], projData[1], projData[2], projData[3],
            projData[4], projData[5], projData[6], projData[7],
            projData[8], projData[9], projData[10], projData[11],
            projData[12], projData[13], projData[14], projData[15]
        );

        this.wOrigin = vec2.fromValues(oData[0], oData[1]);
    }

    screenCoordToWorldDir(x: number, y: number): vec3 {
        const wRight = vec3.create();
        vec3.normalize(wRight, vec3.cross(wRight, this.wEyeDir, this.wUp));

        const upOffset = vec3.scale(vec3.create(), this.wUp, Math.tan(this.fovy / 2) * (y - 0.5) * 2);
        const rightOffset = vec3.scale(vec3.create(), wRight, Math.tan(this.fovy / 2) * (x - 0.5) * 2);
        const offset = vec3.add(vec3.create(), upOffset, rightOffset);
        const dir = vec3.add(vec3.create(), this.wEyeDir, offset);
        vec3.normalize(dir, dir);

        return dir;
    }

    screenCoordToLatLng(x: number, y: number): number[] | null {
        const dir = this.screenCoordToWorldDir(x, y);

        const t = -this.wEye[2] / dir[2];
        if (t > 0) {
            const intersectPoint = vec3.scaleAndAdd(vec3.create(), this.wEye, dir, t);
            const originCoord = GeoUtils.latLng2Coord(this.wOrigin[0], this.wOrigin[1]);
            const latLng = GeoUtils.coord2LatLng(intersectPoint[0] + originCoord[0], intersectPoint[1] + originCoord[1]);

            return latLng;
        }
        return null;
    }

    activateBirdsEye() {
        throw Error("BirdsEye view not implemented yet")
    }
}