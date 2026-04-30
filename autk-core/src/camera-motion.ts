/**
 * @module CameraMotion
 * A fluent camera motion builder for sequential animated camera moves.
 *
 * This module defines `CameraMotion`, which queues motion steps and applies
 * them to a `Camera` one after another. Zoom, pitch, and yaw orbit around the
 * scene center on the ground plane, while roll banks the camera in place.
 * All steps use the same ease-in-out timing curve.
 */
import { Camera } from './camera';

/** Motion kinds accepted by the queued builder steps. */
type StepType = 'zoom' | 'pitch' | 'yaw' | 'roll';

/** One queued camera motion step with its timing and parameters. */
interface CameraStep {
    /** Motion operation to perform. */
    type: StepType;
    /** Angle in radians for pitch/yaw/roll; signed zoom factor for zoom. */
    amount: number;
    /** Duration of the step in milliseconds. */
    durationMs: number;
    /** Optional pitch-only forward translation applied with the orbit. */
    pan?: number;
}

/** Snapshot of camera basis vectors and world-space position reconstructed from the view matrix. */
interface CameraState {
    /** Camera eye position in world space. */
    eye:     [number, number, number];
    /** Camera right basis vector in world space. */
    right:   [number, number, number];
    /** Camera forward basis vector in world space. */
    forward: [number, number, number];
    /** Camera up basis vector in world space. */
    up:      [number, number, number];
    /** Camera look-at target reconstructed from eye and forward. */
    lookAt:  [number, number, number];
}

/**
 * Fluent builder for sequential camera animations.
 *
 * Each builder method appends a step to an internal queue. Call
 * {@link CameraMotion.play} to execute the queued steps in order against a
 * camera instance. The queue is not cleared after playback, so repeated calls
 * replay the same sequence unless a new `CameraMotion` is created.
 *
 * Pitch, yaw, and zoom are applied relative to the scene center, defined as
 * the intersection of the camera's forward ray with the ground plane at `z = 0`.
 * Roll keeps the eye position and look-at target fixed while rotating the up
 * vector around the forward axis. All steps use ease-in-out interpolation.
 *
 * @example
 * await new CameraMotion()
 *     .zoomOut(4, 2.5)        // 4× zoom out over 2.5 s
 *     .pitch(-45, 2.5, 2000)  // tilt 45° over 2.5 s, pan 2000 units forward
 *     .zoomIn(1.5, 2)         // 1.5× zoom in over 2 s
 *     .play(map.camera);
 */
export class CameraMotion {
    /** Queued motion steps executed sequentially by {@link CameraMotion.play}. */
    private steps: CameraStep[] = [];

    /**
     * Zooms the camera out multiplicatively over a duration.
     *
     * @param factor Multiplicative zoom-out factor (e.g. `2` doubles distance).
     * @param durationSec Animation duration in seconds.
     * @returns The motion builder for fluent chaining.
     * @throws Never throws.
     * @example
     * new CameraMotion().zoomOut(4, 2.5).play(camera);
     */
    zoomOut(factor: number, durationSec: number): this {
        this.steps.push({ type: 'zoom', amount: Math.abs(factor), durationMs: durationSec * 1000 });
        return this;
    }

    /**
     * Zooms the camera in multiplicatively over a duration.
     *
     * @param factor Multiplicative zoom-in factor (e.g. `2` halves distance).
     * @param durationSec Animation duration in seconds.
     * @returns The motion builder for fluent chaining.
     * @throws Never throws.
     * @example
     * new CameraMotion().zoomIn(1.5, 2).play(camera);
     */
    zoomIn(factor: number, durationSec: number): this {
        this.steps.push({ type: 'zoom', amount: -Math.abs(factor), durationMs: durationSec * 1000 });
        return this;
    }

    /**
     * Pitches the camera around its right axis, keeping the scene center anchored.
     *
     * @param degrees Pitch angle in degrees.
     * @param durationSec Animation duration in seconds.
     * @param pan Optional forward translation of the orbit center in world units.
     * @returns The motion builder for fluent chaining.
     * @throws Never throws.
     * @example
     * new CameraMotion().pitch(-45, 2.5, 2000).play(camera);
     */
    pitch(degrees: number, durationSec: number, pan: number = 0): this {
        this.steps.push({ type: 'pitch', amount: degrees * (Math.PI / 180), durationMs: durationSec * 1000, pan });
        return this;
    }

    /**
     * Yaws the camera around the world Z axis, keeping distance to center.
     *
     * @param degrees Yaw angle in degrees.
     * @param durationSec Animation duration in seconds.
     * @returns The motion builder for fluent chaining.
     * @throws Never throws.
     * @example
     * new CameraMotion().yaw(90, 3).play(camera);
     */
    yaw(degrees: number, durationSec: number): this {
        this.steps.push({ type: 'yaw', amount: degrees * (Math.PI / 180), durationMs: durationSec * 1000 });
        return this;
    }

    /**
     * Rolls the camera around its forward axis, preserving eye and look-at.
     *
     * @param degrees Roll angle in degrees.
     * @param durationSec Animation duration in seconds.
     * @returns The motion builder for fluent chaining.
     * @throws Never throws.
     * @example
     * new CameraMotion().roll(15, 1).play(camera);
     */
    roll(degrees: number, durationSec: number): this {
        this.steps.push({ type: 'roll', amount: degrees * (Math.PI / 180), durationMs: durationSec * 1000 });
        return this;
    }

    /**
     * Executes all queued motion steps sequentially against a camera.
     *
     * @note The step queue is not cleared — calling `play()` again replays the same sequence.
     * @param camera Camera instance to animate.
     * @returns Promise that resolves when the final step completes.
     * @throws Never throws. Step execution errors are silently absorbed.
     * @example
     * await new CameraMotion().zoomOut(2, 3).yaw(90, 2).play(camera);
     */
    play(camera: Camera): Promise<void> {
        return this.steps.reduce(
            (promise, step) => promise.then(() => this.runStep(camera, step)),
            Promise.resolve(),
        );
    }

    /**
     * Applies symmetric ease-in-out interpolation to normalized progress.
     *
     * @param t Normalized progress in `[0, 1]`.
     * @returns Eased progress value.
     */
    private easeInOut(t: number): number {
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }

    /**
     * Reconstructs world-space camera state from the current view matrix.
     *
     * The returned state is used as the baseline for each queued motion step.
     * `lookAt` is derived as one forward unit from the eye, matching the camera
     * convention used by the motion routines.
     *
     * @param camera Camera whose current view matrix should be decoded.
     * @returns World-space camera basis vectors and position derived from the matrix.
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
     * Rotates vector `v` around unit `axis` by `angle` radians.
     *
     * This helper uses Rodrigues' rotation formula and is shared by pitch,
     * yaw, and roll motion steps.
     *
     * @param v Vector to rotate.
     * @param axis Unit rotation axis.
     * @param angle Rotation angle in radians.
     * @returns Rotated vector.
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

    /**
     * Runs one queued motion step against the camera.
     *
     * The step is evaluated from the camera state at the beginning of the
     * animation frame sequence, then interpolated until the configured duration
     * elapses. Pitch and yaw orbit around the scene center, zoom scales the
     * eye-to-center distance, and roll rotates the up vector around the forward
     * axis.
     *
     * @param camera Camera instance to animate.
     * @param step Motion step to execute.
     * @returns Promise that resolves when the step finishes.
     */
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
