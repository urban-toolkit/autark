import { Camera } from './camera';

type StepType = 'zoom' | 'pitch' | 'yaw' | 'roll';

interface CameraStep {
    type: StepType;
    /** radians for pitch/yaw/roll; zoom factor for zoom (positive = out, negative = in) */
    amount: number;
    durationMs: number;
    /** pitch only: world-unit forward translation applied simultaneously with the orbit */
    pan?: number;
}

interface CameraState {
    eye:     [number, number, number];
    right:   [number, number, number];
    forward: [number, number, number];
    up:      [number, number, number];
    lookAt:  [number, number, number];
}

/**
 * Fluent builder for sequential camera animations.
 *
 * Each method enqueues a step; call {@link CameraAnimator.play} to execute
 * them in order. All operations orbit around the scene center (the point where
 * the camera's forward ray intersects the ground plane at z = 0), and use
 * ease-in-out interpolation for smooth acceleration and deceleration.
 *
 * @example
 * await new CameraAnimator()
 *     .zoomOut(4, 2.5)        // 4× zoom out over 2.5 s
 *     .pitch(-45, 2.5, 2000)  // tilt 45° over 2.5 s, pan 2000 units forward
 *     .zoomIn(1.5, 2)         // 1.5× zoom in over 2 s
 *     .play(map.camera);
 */
export class CameraAnimator {
    private steps: CameraStep[] = [];

    /**
     * Zoom out by `factor` (multiplicative distance increase) over `durationSec` seconds.
     * E.g. `zoomOut(2, 5)` doubles the camera distance from the scene center.
     */
    zoomOut(factor: number, durationSec: number): this {
        this.steps.push({ type: 'zoom', amount: Math.abs(factor), durationMs: durationSec * 1000 });
        return this;
    }

    /**
     * Zoom in by `factor` (multiplicative distance decrease) over `durationSec` seconds.
     * E.g. `zoomIn(2, 5)` halves the camera distance from the scene center.
     */
    zoomIn(factor: number, durationSec: number): this {
        this.steps.push({ type: 'zoom', amount: -Math.abs(factor), durationMs: durationSec * 1000 });
        return this;
    }

    /**
     * Pitch the camera by `degrees` over `durationSec` seconds, orbiting around the scene center.
     * Optional `pan` (world units) translates the orbit center forward simultaneously,
     * keeping the map data centered as the view tilts.
     */
    pitch(degrees: number, durationSec: number, pan: number = 0): this {
        this.steps.push({ type: 'pitch', amount: degrees * (Math.PI / 180), durationMs: durationSec * 1000, pan });
        return this;
    }

    /**
     * Yaw the camera around the world Z-axis by `degrees` over `durationSec` seconds,
     * orbiting around the scene center.
     */
    yaw(degrees: number, durationSec: number): this {
        this.steps.push({ type: 'yaw', amount: degrees * (Math.PI / 180), durationMs: durationSec * 1000 });
        return this;
    }

    /**
     * Roll (bank) the camera around its forward axis by `degrees` over `durationSec` seconds.
     */
    roll(degrees: number, durationSec: number): this {
        this.steps.push({ type: 'roll', amount: degrees * (Math.PI / 180), durationMs: durationSec * 1000 });
        return this;
    }

    /** Execute all enqueued steps sequentially. Resolves when the last step completes. */
    play(camera: Camera): Promise<void> {
        return this.steps.reduce(
            (promise, step) => promise.then(() => this.runStep(camera, step)),
            Promise.resolve(),
        );
    }

    private easeInOut(t: number): number {
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }

    /**
     * Extracts world-space camera vectors from the view matrix.
     *
     * For a column-major lookAt matrix:
     *   - Right:   [m[0], m[4], m[8]]
     *   - Up:      [m[1], m[5], m[9]]
     *   - Forward: [-m[2], -m[6], -m[10]]
     *   - Eye:     -R^T * t  (where t = m[12..14])
     *
     * lookAt is reconstructed as eye + forward * 1 (the camera always maintains
     * a distance-1 look-at after any zoom/translate/yaw/pitch call).
     */
    private stateFromViewMatrix(camera: Camera): CameraState {
        const m = camera.getModelViewMatrix();
        const eye: [number, number, number] = [
            -(m[0] * m[12] + m[1] * m[13] + m[2] * m[14]),
            -(m[4] * m[12] + m[5] * m[13] + m[6] * m[14]),
            -(m[8] * m[12] + m[9] * m[13] + m[10] * m[14]),
        ];
        const right:   [number, number, number] = [m[0], m[4], m[8]];
        const up:      [number, number, number] = [m[1], m[5], m[9]];
        const forward: [number, number, number] = [-m[2], -m[6], -m[10]];
        const lookAt:  [number, number, number] = [
            eye[0] + forward[0],
            eye[1] + forward[1],
            eye[2] + forward[2],
        ];
        return { eye, right, forward, up, lookAt };
    }

    /**
     * Rotates vector `v` around unit `axis` by `angle` radians (Rodrigues' formula).
     */
    private rotateAround(
        v:     [number, number, number],
        axis:  [number, number, number],
        angle: number,
    ): [number, number, number] {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const dot = v[0] * axis[0] + v[1] * axis[1] + v[2] * axis[2];
        const cx  = axis[1] * v[2] - axis[2] * v[1];
        const cy  = axis[2] * v[0] - axis[0] * v[2];
        const cz  = axis[0] * v[1] - axis[1] * v[0];
        return [
            v[0] * cos + cx * sin + axis[0] * dot * (1 - cos),
            v[1] * cos + cy * sin + axis[1] * dot * (1 - cos),
            v[2] * cos + cz * sin + axis[2] * dot * (1 - cos),
        ];
    }

    private runStep(camera: Camera, step: CameraStep): Promise<void> {
        return new Promise((resolve) => {
            const startTime = performance.now();

            // resetCamera() resets the view matrix to identity; update() recomputes it
            // from wEye/wLookAt/wUp. Without this, stateFromViewMatrix reads a stale matrix.
            camera.update();

            // All steps orbit around the scene center so the map stays anchored on screen.
            const startState = this.stateFromViewMatrix(camera);

            // Scene center: where the forward ray intersects the ground plane (z = 0).
            const t = startState.forward[2] !== 0 ? -startState.eye[2] / startState.forward[2] : 0;
            const sceneCenter: [number, number, number] = [
                startState.eye[0] + startState.forward[0] * t,
                startState.eye[1] + startState.forward[1] * t,
                0,
            ];
            const eyeOffset: [number, number, number] = [
                startState.eye[0] - sceneCenter[0],
                startState.eye[1] - sceneCenter[1],
                startState.eye[2] - sceneCenter[2],
            ];

            // Zoom: log-linear scale of the eye-to-sceneCenter distance, preserving orientation.
            const sign = step.amount > 0 ? 1 : -1;
            const zoomLogEnd = sign * Math.log(Math.abs(step.amount));

            const tick = (now: number) => {
                const currProgress = Math.min((now - startTime) / step.durationMs, 1);
                const currEased = this.easeInOut(currProgress);

                if (step.type === 'pitch') {
                    const newEyeOff = this.rotateAround(eyeOffset, startState.right, -step.amount * currEased);
                    const newUp     = this.rotateAround(startState.up, startState.right, -step.amount * currEased);

                    // Optional pan: translate the orbit center forward along the ground.
                    // Direction = -normalize(up.xy) — where the camera looks on XY as it tilts.
                    let panX = 0, panY = 0;
                    const pan = step.pan ?? 0;
                    if (pan !== 0) {
                        const upXYLen = Math.sqrt(startState.up[0] ** 2 + startState.up[1] ** 2);
                        if (upXYLen > 1e-6) {
                            panX = (-startState.up[0] / upXYLen) * pan * currEased;
                            panY = (-startState.up[1] / upXYLen) * pan * currEased;
                        }
                    }

                    const center: [number, number, number] = [sceneCenter[0] + panX, sceneCenter[1] + panY, 0];
                    const newEye: [number, number, number] = [
                        center[0] + newEyeOff[0],
                        center[1] + newEyeOff[1],
                        center[2] + newEyeOff[2],
                    ];
                    camera.resetCamera(newUp, center, newEye);
                    camera.update();

                } else if (step.type === 'yaw') {
                    const newEyeOff = this.rotateAround(eyeOffset, [0, 0, 1], step.amount * currEased);
                    const newUp     = this.rotateAround(startState.up, [0, 0, 1], step.amount * currEased);
                    const newEye: [number, number, number] = [
                        sceneCenter[0] + newEyeOff[0],
                        sceneCenter[1] + newEyeOff[1],
                        sceneCenter[2] + newEyeOff[2],
                    ];
                    camera.resetCamera(newUp, sceneCenter, newEye);
                    camera.update();

                } else if (step.type === 'zoom') {
                    const scale = Math.exp(zoomLogEnd * currEased);
                    const newEye: [number, number, number] = [
                        sceneCenter[0] + eyeOffset[0] * scale,
                        sceneCenter[1] + eyeOffset[1] * scale,
                        sceneCenter[2] + eyeOffset[2] * scale,
                    ];
                    camera.resetCamera(startState.up, sceneCenter, newEye);
                    camera.update();

                } else if (step.type === 'roll') {
                    const newUp = this.rotateAround(startState.up, startState.forward, step.amount * currEased);
                    camera.resetCamera(newUp, startState.lookAt, startState.eye);
                    camera.update();
                }

                if (currProgress < 1) {
                    requestAnimationFrame(tick);
                } else {
                    resolve();
                }
            };

            requestAnimationFrame(tick);
        });
    }
}
