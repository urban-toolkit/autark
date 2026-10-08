/**
 * @module map-terrain
 * Terrain-mode map render-path orchestration.
 *
 * This module coordinates the high-level terrain frame: overlay rendering,
 * terrain mesh rendering, terrain-aware building compositing, and terrain-mode
 * picking. Low-level terrain GPU resources are owned by `TerrainRenderer`.
 */

import { Camera } from '@urban-toolkit/autk-core';

import { LayerManager } from './layer-manager';
import { Triangles3DLayer } from './layer-triangles3D';
import { MapStyle } from './map-style';
import { MapPickingController } from './map-picking';
import type { PendingPick } from './map-picking';
import { PipelineBuildingSSAO } from './pipeline-triangle-ssao';
import { Renderer } from './renderer';
import { TerrainRenderer } from './renderer-terrain';
import type { TerrainDebugOptions } from './renderer-terrain';
import type { Heightfield } from '@urban-toolkit/autk-core';

/** Maximum requested overlay texture dimension before clamping to device limits. */
const TERRAIN_OVERLAY_TEXTURE_SIZE = 4096;

/** Pixel rectangle inside the overlay texture used for the current visible bounds. */
type OverlayPixelRect = { x: number; y: number; width: number; height: number };

/**
 * Coordinates one terrain-mode map frame.
 *
 * The render path projects regular map layers into an offscreen overlay texture,
 * renders that overlay over terrain geometry, then composites terrain-aware 3D
 * layers and resolves picking.
 */
export class TerrainMapRenderPath {
    /** Low-level terrain mesh renderer rebuilt when overlay views change. */
    private terrainRenderer: TerrainRenderer | null = null;
    /** Optional frozen world bounds used to draw overlay bounds debug geometry. */
    private frozenTerrainOverlayBounds: [number, number, number, number] | null = null;
    /** Camera XY position captured with frozen debug bounds. */
    private frozenTerrainCameraPosition: [number, number] | null = null;
    /** Orthographic camera used to render 2D layers into the terrain overlay. */
    private readonly terrainOverlayCamera: Camera = new Camera();
    /** Runtime terrain debug flags forwarded to the low-level terrain renderer. */
    private terrainDebug: Required<TerrainDebugOptions> = {
        showMesh: false,
        enableCulling: true,
        freezeLod: false,
    };

    /**
     * Creates a terrain render path and initializes terrain GPU resources.
     *
     * @param renderer Shared renderer that owns frame and overlay targets.
     * @param camera Main perspective camera used for terrain rendering.
     * @param layerManager Ordered layer source used for overlays and buildings.
     * @param picking Shared picking helper for readback and event emission.
     * @param style Instance-specific style used for terrain water and overlay colors.
     * @param heightfield Local-space heightfield sampled by terrain and buildings.
     * @param requestRender Schedules another frame when GPU work that lands after a frame changes what the next one draws.
     * @throws If renderer overlay texture views cannot be created by the renderer.
     * @example
     * const terrainPath = new TerrainMapRenderPath(renderer, camera, layers, picking, style, heightfield, () => map.requestRender());
     */
    constructor(
        /** Shared renderer used to create render passes and submit commands. */
        private readonly renderer: Renderer,
        /** Main map camera used for terrain and 3D layer rendering. */
        private readonly camera: Camera,
        /** Ordered collection of layers drawn into the terrain frame. */
        private readonly layerManager: LayerManager,
        /** Shared picking helper used before and after terrain picking passes. */
        private readonly picking: MapPickingController,
        /** Instance-specific style used for terrain water and overlay colors. */
        private readonly style: MapStyle,
        /** Local-space height samples used to initialize the terrain renderer. */
        private readonly heightfield: Heightfield,
        /** Schedules another frame when a GPU readback changes what the next frame draws. */
        private readonly requestRender: () => void,
    ) {
        this.fitCameraToTerrainBounds();
        const overlaySize = this.getTerrainOverlayTextureSize();
        this.renderer.configureOverlayTexture(overlaySize, overlaySize);
        this.rebuildTerrainRenderer();
    }

    /**
     * Renders one terrain-mode frame.
     *
     * The frame renders visible non-3D layers into an overlay texture, draws the
     * terrain, records terrain depth, composites terrain-aware buildings, and
     * resolves a pending picking request when present.
     *
     * @returns Nothing. GPU commands are submitted through the renderer.
     * @throws Propagates renderer or layer errors to the caller's frame guard.
     * @example
     * terrainPath.renderFrame();
     */
    renderFrame(): void {
        const terrain = this.terrainRenderer;
        if (!terrain) {
            return;
        }

        this.renderer.start();
        const overlaySize = this.getTerrainOverlayTextureSize();
        const overlayResized = this.renderer.configureOverlayTexture(overlaySize, overlaySize);
        if (overlayResized) {
            this.rebuildTerrainRenderer();
        }
        const activeTerrain = this.terrainRenderer;
        if (!activeTerrain) {
            return;
        }
        const pendingPick = this.picking.consumePendingPick();
        const fallbackBounds = this.computeTerrainVisibleBounds(activeTerrain.bounds);
        const waterColor = this.getTerrainWaterColor();
        activeTerrain.update(this.camera, fallbackBounds, [0, 0, 1, 1], waterColor, this.terrainDebug);
        const reducedBounds = activeTerrain.visibleBounds;
        const overlayBounds = reducedBounds && this.isUsableTerrainOverlayBounds(reducedBounds, fallbackBounds, activeTerrain.bounds)
            ? reducedBounds
            : fallbackBounds;
        const overlayPixelRect = this.computeTerrainOverlayPixelRect(overlayBounds);
        const overlayUvRect: [number, number, number, number] = [
            overlayPixelRect.x / this.renderer.overlayWidth,
            overlayPixelRect.y / this.renderer.overlayHeight,
            overlayPixelRect.width / this.renderer.overlayWidth,
            overlayPixelRect.height / this.renderer.overlayHeight,
        ];

        try {
            activeTerrain.encodeVisibleBoundsReduction(this.renderer.commandEncoder);
        } catch (error) {
            console.warn('Terrain visible bounds prepass failed; using fallback bounds:', error);
        }
        this.terrainOverlayCamera.setOrthographicBounds(
            overlayBounds[0],
            overlayBounds[2],
            overlayBounds[1],
            overlayBounds[3],
        );

        this.layerManager.layers.forEach((layer) => {
            if (!layer.layerRenderInfo.isSkip && !(layer instanceof Triangles3DLayer)) {
                layer.prepareRender(this.terrainOverlayCamera);
            }
        });
        const overlayPass = this.renderer.beginOverlayRenderPass();
        overlayPass.setViewport(overlayPixelRect.x, overlayPixelRect.y, overlayPixelRect.width, overlayPixelRect.height, 0, 1);
        overlayPass.setScissorRect(overlayPixelRect.x, overlayPixelRect.y, overlayPixelRect.width, overlayPixelRect.height);
        this.layerManager.layers.forEach((layer) => {
            if (!layer.layerRenderInfo.isSkip && !(layer instanceof Triangles3DLayer)) {
                layer.renderPass(this.terrainOverlayCamera, overlayPass);
            }
        });
        overlayPass.end();

        activeTerrain.update(this.camera, overlayBounds, overlayUvRect, waterColor, this.terrainDebug);
        const terrainPass = this.renderer.beginMainRenderPass();
        activeTerrain.render(terrainPass, this.terrainDebug.showMesh);
        if (this.frozenTerrainOverlayBounds) {
            activeTerrain.renderOverlayBounds(
                terrainPass,
                this.frozenTerrainOverlayBounds,
                this.frozenTerrainCameraPosition ?? undefined,
            );
        }
        terrainPass.end();
        this.renderer.configureTerrainDepthTexture(
            2 * this.renderer.pixelWidth,
            2 * this.renderer.pixelHeight,
        );
        const terrainDepthPass = this.renderer.beginTerrainDepthRenderPass();
        activeTerrain.renderDepth(terrainDepthPass);
        terrainDepthPass.end();

        const visible3DLayers = this.layerManager.layers.filter(
            (layer): layer is Triangles3DLayer => !layer.layerRenderInfo.isSkip && layer instanceof Triangles3DLayer
        );
        if (visible3DLayers.length > 0) {
            const heightfield = activeTerrain.heightfield;
            const terrainHeightView = activeTerrain.terrainHeightTextureView;
            const geometryPassEncoder = PipelineBuildingSSAO.beginSharedGeometryPass(this.renderer);
            visible3DLayers.forEach((layer) => {
                layer.setTerrainHeightSource(heightfield, terrainHeightView);
                layer.renderSceneGeometry(this.camera, geometryPassEncoder);
            });
            geometryPassEncoder.end();

            const buildingCompositePass = this.renderer.beginMainColorRenderPass('load');
            PipelineBuildingSSAO.compositeSharedPassWithTerrainDepth(
                this.renderer,
                buildingCompositePass,
                this.renderer.terrainDepthTextureView,
            );
            buildingCompositePass.end();
        }
        const pickReadbackSlot = this.renderTerrainPickingPass(pendingPick, activeTerrain, overlayPixelRect);
        this.renderer.finish();
        this.picking.resolvePickingReadback(pendingPick, pickReadbackSlot);
        // The overlay of the next frame covers the bounds this readback finds, so new bounds need a frame.
        activeTerrain.resolveVisibleBoundsReadback(this.requestRender);
    }

    /**
     * Resets the main camera to frame the active heightfield bounds.
     *
     * @returns Nothing. The camera position and viewport matrices are updated.
     * @throws Never throws.
     * @example
     * terrainPath.resetCamera();
     */
    resetCamera(): void {
        this.fitCameraToTerrainBounds();
    }

    /**
     * Updates terrain debug flags used on subsequent frames.
     *
     * @param options Partial debug settings to merge with the current state.
     * @returns Nothing.
     * @throws Never throws.
     * @example
     * terrainPath.updateDebug({ showMesh: true });
     */
    updateDebug(options: Partial<TerrainDebugOptions>): void {
        this.terrainDebug = { ...this.terrainDebug, ...options };
    }

    /**
     * Toggles frozen overlay bounds debug rendering.
     *
     * The first call captures the current computed visible bounds; the next call
     * clears them.
     *
     * @returns Nothing.
     * @throws Never throws.
     * @example
     * terrainPath.toggleOverlayBoundsDebug();
     */
    toggleOverlayBoundsDebug(): void {
        if (this.frozenTerrainOverlayBounds) {
            this.frozenTerrainOverlayBounds = null;
            this.frozenTerrainCameraPosition = null;
            console.log('Terrain overlay bounds debug: cleared');
            return;
        }

        if (!this.terrainRenderer) {
            console.warn('Terrain overlay bounds debug requires terrain mode.');
            return;
        }

        this.frozenTerrainOverlayBounds = this.computeTerrainVisibleBounds(this.terrainRenderer.bounds);
        const [x, y] = this.camera.getEye();
        this.frozenTerrainCameraPosition = [x, y];
        console.log('Terrain overlay bounds debug:', this.frozenTerrainOverlayBounds, 'camera:', this.frozenTerrainCameraPosition);
    }

    /**
     * Releases terrain resources and clears terrain height bindings on 3D layers.
     *
     * @returns Nothing. Repeated calls are safe.
     * @throws Never throws.
     * @example
     * terrainPath.destroy();
     */
    destroy(): void {
        this.layerManager.layers.forEach((layer) => {
            if (layer instanceof Triangles3DLayer) {
                layer.clearTerrainHeightSource();
            }
        });
        this.terrainRenderer?.destroy();
        this.terrainRenderer = null;
    }

    /**
     * Resolves the overlay texture size allowed by the current GPU device.
     *
     * @returns Clamped square texture dimension in pixels.
     * @throws Never throws.
     * @example
     * const size = terrainPath['getTerrainOverlayTextureSize']();
     */
    private getTerrainOverlayTextureSize(): number {
        return Math.min(TERRAIN_OVERLAY_TEXTURE_SIZE, this.renderer.device.limits.maxTextureDimension2D);
    }

    /**
     * Recreates the low-level terrain renderer with current overlay texture views.
     *
     * @returns Nothing. Existing terrain GPU resources are destroyed first.
     * @throws If terrain GPU resource creation fails.
     * @example
     * terrainPath['rebuildTerrainRenderer']();
     */
    private rebuildTerrainRenderer(): void {
        this.terrainRenderer?.destroy();
        this.terrainRenderer = new TerrainRenderer(
            this.renderer.device,
            this.renderer.canvasFormat,
            'depth32float',
            this.renderer.sampleCount,
            this.heightfield,
            this.renderer.overlayTextureView,
            this.renderer.overlayPickingTextureView,
        );
    }

    /**
     * Positions the main camera so the heightfield bounds fit the viewport.
     *
     * @returns Nothing. The camera is reset and resized using renderer pixels.
     * @throws Never throws.
     * @example
     * terrainPath['fitCameraToTerrainBounds']();
     */
    private fitCameraToTerrainBounds(): void {
        const bounds = this.heightfield.bounds;
        const width = Math.max(bounds[2] - bounds[0], 1);
        const height = Math.max(bounds[3] - bounds[1], 1);
        const centerX = (bounds[0] + bounds[2]) * 0.5;
        const centerY = (bounds[1] + bounds[3]) * 0.5;
        const aspect = Math.max(this.renderer.pixelWidth / Math.max(this.renderer.pixelHeight, 1), 1e-6);
        const halfFovTangent = Math.tan(this.camera.getFovyRadians() * 0.5);
        const distanceForHeight = height / (2 * halfFovTangent);
        const distanceForWidth = width / (2 * halfFovTangent * aspect);
        const distance = Math.max(distanceForHeight, distanceForWidth) * 1.08;

        this.camera.resetCamera([0, 1, 0], [centerX, centerY, 0], [centerX, centerY, distance]);
        this.camera.resize(this.renderer.pixelWidth, this.renderer.pixelHeight);
    }

    /**
     * Renders the terrain-mode picking passes for one pending request.
     *
     * @param pendingPick Pending pick consumed at the start of the frame.
     * @param activeTerrain Terrain renderer used for terrain depth and picking.
     * @param overlayPixelRect Pixel rectangle occupied by the overlay in its texture.
     * @returns Picking readback slot, or `null` when no pick is pending.
     * @throws Propagates render-pass creation or layer rendering errors.
     * @example
     * const slot = terrainPath['renderTerrainPickingPass'](pendingPick, terrain, rect);
     */
    private renderTerrainPickingPass(
        pendingPick: PendingPick | null,
        activeTerrain: TerrainRenderer,
        overlayPixelRect: OverlayPixelRect,
    ): number | null {
        if (!pendingPick) {
            return null;
        }

        if (pendingPick.layer instanceof Triangles3DLayer) {
            const terrainDepthPass = this.renderer.beginPickingDepthRenderPass();
            activeTerrain.renderDepth(terrainDepthPass);
            terrainDepthPass.end();

            const buildingPickingPass = this.renderer.beginPickingRenderPass('load');
            pendingPick.layer.setTerrainHeightSource(activeTerrain.heightfield, activeTerrain.terrainHeightTextureView);
            pendingPick.layer.renderPickingPass(this.camera, buildingPickingPass);
            buildingPickingPass.end();
            return this.picking.enqueuePickingReadback(pendingPick);
        }

        const overlayPickingPass = this.renderer.beginOverlayPickingRenderPass();
        overlayPickingPass.setViewport(overlayPixelRect.x, overlayPixelRect.y, overlayPixelRect.width, overlayPixelRect.height, 0, 1);
        overlayPickingPass.setScissorRect(overlayPixelRect.x, overlayPixelRect.y, overlayPixelRect.width, overlayPixelRect.height);
        pendingPick.layer.renderPickingPass(this.terrainOverlayCamera, overlayPickingPass);
        overlayPickingPass.end();

        const terrainPickingPass = this.renderer.beginPickingRenderPass();
        activeTerrain.renderPicking(terrainPickingPass);
        terrainPickingPass.end();
        return this.picking.enqueuePickingReadback(pendingPick);
    }

    /**
     * Reads the style water color as normalized RGB values for terrain shading.
     *
     * @returns Normalized water color as `[r, g, b]`.
     * @throws Never throws.
     * @example
     * const color = terrainPath['getTerrainWaterColor']();
     */
    private getTerrainWaterColor(): [number, number, number] {
        const color = this.style.getColor('water');
        return [color.r / 255, color.g / 255, color.b / 255];
    }

    /**
     * Estimates world-space XY bounds visible from the current camera.
     *
     * @param terrainBounds Full terrain bounds used to limit ray distance fallback.
     * @returns Estimated visible bounds as `[minX, minY, maxX, maxY]`.
     * @throws Never throws.
     * @example
     * const bounds = terrainPath['computeTerrainVisibleBounds'](terrain.bounds);
     */
    private computeTerrainVisibleBounds(terrainBounds: readonly [number, number, number, number]): [number, number, number, number] {
        const points: Array<[number, number]> = [];
        const eye = this.camera.getEye();
        const terrainDiagonal = Math.hypot(terrainBounds[2] - terrainBounds[0], terrainBounds[3] - terrainBounds[1]);
        const maxRayDistance = Math.min(
            this.camera.getFar(),
            Math.max(Math.abs(eye[2]) * 8, terrainDiagonal * 0.05, 1),
        );
        const corners: Array<[number, number]> = [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
        ];

        for (const [x, y] of corners) {
            const direction = this.camera.getWorldRayDirection(x, y);
            const groundDistance = Math.abs(direction[2]) > 1e-6
                ? -eye[2] / direction[2]
                : Number.POSITIVE_INFINITY;
            const distance = groundDistance > 0
                ? Math.min(groundDistance, maxRayDistance)
                : maxRayDistance;

            points.push([eye[0] + direction[0] * distance, eye[1] + direction[1] * distance]);
        }

        if (points.length === 0) {
            const lookAt = this.camera.getLookAt();
            points.push([lookAt[0], lookAt[1]]);
        }

        const rawMinX = Math.min(...points.map((point) => point[0]));
        const rawMaxX = Math.max(...points.map((point) => point[0]));
        const rawMinY = Math.min(...points.map((point) => point[1]));
        const rawMaxY = Math.max(...points.map((point) => point[1]));

        return [
            rawMinX,
            rawMinY,
            rawMaxX,
            rawMaxY,
        ];
    }

    /**
     * Computes the centered overlay viewport for a world-space bounds aspect.
     *
     * @param bounds World-space overlay bounds that should fit inside the texture.
     * @returns Pixel rectangle inside the overlay texture.
     * @throws Never throws.
     * @example
     * const rect = terrainPath['computeTerrainOverlayPixelRect'](bounds);
     */
    private computeTerrainOverlayPixelRect(bounds: readonly [number, number, number, number]): OverlayPixelRect {
        const textureWidth = Math.max(1, this.renderer.overlayWidth);
        const textureHeight = Math.max(1, this.renderer.overlayHeight);
        const boundsWidth = Math.max(bounds[2] - bounds[0], 1);
        const boundsHeight = Math.max(bounds[3] - bounds[1], 1);
        const boundsAspect = boundsWidth / boundsHeight;
        const textureAspect = textureWidth / textureHeight;
        let width: number;
        let height: number;

        if (boundsAspect >= textureAspect) {
            width = textureWidth;
            height = Math.max(1, Math.floor(textureWidth / boundsAspect));
        } else {
            height = textureHeight;
            width = Math.max(1, Math.floor(textureHeight * boundsAspect));
        }

        return {
            x: Math.floor((textureWidth - width) * 0.5),
            y: Math.floor((textureHeight - height) * 0.5),
            width,
            height,
        };
    }

    /**
     * Checks whether GPU-reduced overlay bounds are safe to use this frame.
     *
     * Bounds must be finite, non-degenerate, and overlap both terrain and the
     * camera-based fallback bounds.
     *
     * @param bounds Candidate reduced bounds.
     * @param fallbackBounds Camera-derived fallback bounds.
     * @param terrainBounds Full terrain bounds.
     * @returns `true` when the candidate bounds can drive overlay rendering.
     * @throws Never throws.
     * @example
     * const usable = terrainPath['isUsableTerrainOverlayBounds'](reduced, fallback, terrain.bounds);
     */
    private isUsableTerrainOverlayBounds(
        bounds: readonly [number, number, number, number],
        fallbackBounds: readonly [number, number, number, number],
        terrainBounds: readonly [number, number, number, number],
    ): boolean {
        if (!bounds.every(Number.isFinite)) {
            return false;
        }

        const width = bounds[2] - bounds[0];
        const height = bounds[3] - bounds[1];
        if (width <= 1 || height <= 1) {
            return false;
        }

        const terrainOverlap = bounds[0] < terrainBounds[2]
            && bounds[2] > terrainBounds[0]
            && bounds[1] < terrainBounds[3]
            && bounds[3] > terrainBounds[1];
        const fallbackOverlap = bounds[0] < fallbackBounds[2]
            && bounds[2] > fallbackBounds[0]
            && bounds[1] < fallbackBounds[3]
            && bounds[3] > fallbackBounds[1];

        return terrainOverlap && fallbackOverlap;
    }
}
