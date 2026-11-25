import { AutkMap } from '../src/map';
import { MapEvent } from '../src/types-events';
import { StaticHeightSource } from '../src/height-source';
import { Camera, heightfieldFromRaster } from '@urban-toolkit/autk-core';
import { PipelineBuildingSSAO } from '../src/pipeline-triangle-ssao';
import type { Layer } from '../src/layer';
import type { Triangles3DLayer } from '../src/layer-triangles3D';
import type { FeatureCollection, Geometry } from 'geojson';

/** Pixel/readback regressions using production pipelines and a real perspective camera. */
export async function runWebGpuCases() {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:128px;height:128px';
    const host = document.createElement('div');
    host.style.cssText = 'width:128px;height:128px';
    host.append(canvas);
    document.body.append(host);
    const map = new AutkMap(canvas, { showUi: false });
    const resources: Array<{ destroy(): void }> = [];
    const checks: string[] = [];
    const assert = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
    const square = (halfSize: number): FeatureCollection => ({ type: 'FeatureCollection', features: [{
        type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[
            [-halfSize, -halfSize], [halfSize, -halfSize], [halfSize, halfSize], [-halfSize, halfSize], [-halfSize, -halfSize],
        ]] },
    }] });
    try {
        await map.init();
        const renderer = map.renderer;
        const device = renderer.device;
        renderer.resize(128, 128, 1);
        device.pushErrorScope('validation');
        const errors: string[] = [];
        device.addEventListener('uncapturederror', event => errors.push(event.error.message));
        const texture = (format: GPUTextureFormat, sampleCount = 1, copy = false) => {
            const target = device.createTexture({ size: [128, 128], format, sampleCount,
                usage: GPUTextureUsage.RENDER_ATTACHMENT | (copy ? GPUTextureUsage.COPY_SRC : 0) });
            resources.push(target);
            return target;
        };
        const output = texture(renderer.canvasFormat, 1, true);
        const multisampled = texture(renderer.canvasFormat, renderer.sampleCount);
        const depth = texture('depth32float', renderer.sampleCount);
        const readback = device.createBuffer({ size: 128 * 512, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
        resources.push(readback);
        const layer = (id: string) => map.layerManager.searchByLayerId(id)!;
        const orderedLayers = () => map.getLayerOrder().map(layer);
        const camera = new Camera();
        camera.resetCamera([0, 1, 0], [0, 0, 0], [0, 0, 13.036753]);
        camera.resize(128, 128);

        async function pixels(layers: Layer[], pick?: Layer, buildings: Triangles3DLayer[] = [], view = camera) {
            renderer.start();
            if (buildings.length) {
                const geometryPass = PipelineBuildingSSAO.beginSharedGeometryPass(renderer);
                for (const building of buildings) building.renderSceneGeometry(view, geometryPass);
                geometryPass.end();
            }
            const pass = renderer.commandEncoder.beginRenderPass({
                colorAttachments: [{ view: multisampled.createView(), resolveTarget: output.createView(),
                    loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }],
                depthStencilAttachment: { view: depth.createView(), depthLoadOp: 'clear', depthStoreOp: 'store', depthClearValue: 0 },
            });
            for (const target of layers) target.renderPass(view, pass);
            if (buildings.length) PipelineBuildingSSAO.compositeSharedPass(renderer, pass);
            pass.end();
            if (pick) {
                const pickPass = renderer.beginPickingRenderPass();
                pick.renderPickingPass(view, pickPass);
                pickPass.end();
            }
            renderer.commandEncoder.copyTextureToBuffer({ texture: pick ? renderer.pickingTexture : output },
                { buffer: readback, bytesPerRow: 512 }, [128, 128]);
            renderer.finish();
            await readback.mapAsync(GPUMapMode.READ);
            const data = new Uint8Array(readback.getMappedRange()).slice();
            readback.unmap();
            return data;
        }
        const rgba = (data: Uint8Array, x: number, y: number) => {
            const pixel = Array.from(data.slice((y * 128 + x) * 4, (y * 128 + x) * 4 + 4));
            return renderer.canvasFormat.startsWith('bgra') ? [pixel[2], pixel[1], pixel[0], pixel[3]] : pixel;
        };
        const near = (actual: number[], expected: number[], name: string) => {
            assert(actual.every((value, i) => Math.abs(value - expected[i]) <= 2), `${name}: ${actual} != ${expected}`);
        };
        const identical = (a: Uint8Array, b: Uint8Array, name: string) => {
            assert(a.every((value, i) => value === b[i]), name);
        };

        map.loadCollection('lower', { collection: square(4), type: 'polygons' });
        map.loadCollection('upper', { collection: square(5), type: 'polygons' });
        map.updateRenderInfo('lower', { color: { r: 255, g: 0, b: 0, alpha: 1 }, showBorders: true, strokeColor: { r: 255, g: 0, b: 0, alpha: 1 } });
        map.updateRenderInfo('upper', { color: { r: 0, g: 0, b: 255, alpha: 1 }, showBorders: false, opacity: 0.5 });
        near(rgba(await pixels(orderedLayers()), 64, 64), [127, 0, 128, 255], 'Translucent upper layer');
        map.setLayerOrder(['upper', 'lower']);
        near(rgba(await pixels(orderedLayers()), 64, 64), [255, 0, 0, 255], 'Reversed draw order');
        map.setLayerOrder([]);
        near(rgba(await pixels(orderedLayers()), 64, 64), [127, 0, 128, 255], 'Restored default draw order');
        checks.push('2D draw order and premultiplied transparency');

        map.updateRenderInfo('upper', { opacity: 1 });
        near(rgba(await pixels([layer('lower'), layer('upper')]), 111, 64), [0, 0, 255, 255], 'Upper fill covers lower border');
        checks.push('fill/border grouping');
        map.fitBounds();
        const fitted = await pixels([layer('lower')], layer('lower'), [], map.camera);
        assert(fitted[(12 * 128 + 12) * 4] === 1, 'Small polygon is cropped by its layer order');
        checks.push('small-area fit with the real camera');

        const visible = await pixels([layer('upper')]);
        const picked = await pixels([layer('upper')], layer('upper'));
        map.setLayerOrder(['upper', 'lower']);
        identical(visible, await pixels([layer('upper')]), 'Layer order changed visible coordinates');
        identical(picked, await pixels([layer('upper')], layer('upper')), 'Layer order changed picking coordinates');
        const pitched = new Camera({ eye: [0, -12, 15], lookAt: [0, 0, 0], up: [0, 1, 0] });
        pitched.resize(128, 128);
        const tilted = await pixels([layer('upper')], layer('upper'), [], pitched);
        map.setLayerOrder([]);
        identical(tilted, await pixels([layer('upper')], layer('upper'), [], pitched), 'Layer order changed pitched geometry');
        checks.push('visible/picking invariance under order changes and pitch');

        const primitives: Array<[string, Geometry]> = [
            ['line', { type: 'LineString', coordinates: [[-3, 0], [3, 0]] }],
            ['point', { type: 'Point', coordinates: [0, 0] }],
        ];
        for (const [id, geometry] of primitives) {
            map.loadCollection(id, { collection: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry }] } });
            map.updateRenderInfo(id, { color: { r: 0, g: 255, b: 0, alpha: 1 }, pointSize: 1, polylinesWidth: 1 });
            const target = layer(id);
            const before = await pixels([target], target);
            assert(before[(64 * 128 + 64) * 4] === 1, `${id} picking missed the feature`);
            map.setLayerOrder([id, 'lower']);
            identical(before, await pixels([target], target), `${id} picking moved with layer order`);
            near(rgba(await pixels([target]), 64, 64), [0, 255, 0, 255], `${id} visible location`);
        }
        checks.push('polyline and sprite visible/picking alignment');

        const line = layer('line');
        map.setSkipped('line', [0]);
        near(rgba(await pixels([line]), 64, 64), [0, 0, 0, 0], 'Hidden line is not visible');
        assert((await pixels([], line))[(64 * 128 + 64) * 4] === 0, 'Hidden line is not pickable');
        map.setSkipped('line', []);
        assert((await pixels([], line))[(64 * 128 + 64) * 4] === 1, 'Restored line is pickable before the visible pass');
        near(rgba(await pixels([line]), 64, 64), [0, 255, 0, 255], 'Restored line is visible');
        checks.push('polyline hiding and restoration sync visible and picking state independently');

        async function stateUploads(draw: () => Promise<Uint8Array>, expected: string[]) {
            const queue = device.queue;
            const write = queue.writeBuffer;
            const uploads: string[] = [];
            queue.writeBuffer = (buffer, ...args) => {
                if (!/matrix|point size/i.test(buffer.label)) uploads.push(buffer.label);
                return write.call(queue, buffer, ...args);
            };
            try {
                const result = await draw();
                assert(uploads.sort().join(',') === [...expected].sort().join(','),
                    `Expected only ${expected.join(', ')}; uploaded ${uploads.join(', ')}`);
                return result;
            } finally {
                queue.writeBuffer = write;
            }
        }
        for (const [id, highlight, skip, picking, border] of [
            ['lower', 'Highlighted data buffer', 'Skipped data buffer', 'Object id buffer', true],
            ['point', 'Point highlighted buffer', 'Point skipped buffer', 'Point picking ids buffer', false],
        ] as const) {
            const target = layer(id);
            const draw = () => pixels([target], target);
            const before = await draw();
            map.setSelection(id, [0]);
            identical(before, await stateUploads(draw, [highlight]), `${id} selection changed picking IDs`);
            map.setHover(id, [0]);
            identical(before, await stateUploads(draw, [highlight]), `${id} hover changed picking IDs`);
            map.setHover(id, []);
            await stateUploads(draw, [highlight]);
            const index = (64 * 128 + 64) * 4;
            map.setSkipped(id, [0]);
            assert((await stateUploads(() => pixels([], target), [picking]))[index] === 0, `Hidden ${id} is pickable`);
            near(rgba(await stateUploads(() => pixels([target]), border ? [skip, skip] : [skip]), 64, 64), [0, 0, 0, 0], `Hidden ${id} is visible`);
            map.setSkipped(id, []);
            identical(before, await stateUploads(draw, border ? [skip, skip, picking] : [skip, picking]), `${id} picking did not restore`);
        }
        checks.push('polygon and point highlight and hide only upload their interaction buffers');

        const raster: FeatureCollection = { type: 'FeatureCollection', bbox: [-5, -5, 5, 5], features: [{
            type: 'Feature', geometry: square(5).features[0].geometry, properties: { rasterResX: 2, rasterResY: 2, band: [3, 3, 3, 3] },
        }] };
        map.loadCollection('raster', { collection: raster, type: 'raster', property: 'band' });
        const rasterPixels = await pixels([layer('raster')]);
        assert(rasterPixels[(64 * 128 + 64) * 4 + 3] > 0, 'Raster did not render');
        map.setLayerOrder(['raster', 'line']);
        near(rgba(await pixels(orderedLayers().filter(target => target === layer('raster') || target === layer('line'))), 64, 64),
            [0, 255, 0, 255], 'Line renders over raster after reordering');
        identical(rasterPixels, await pixels([layer('raster')]), 'Raster moved with layer order');
        checks.push('raster ground-plane rendering');

        map.loadMesh('buildings', {
            geometry: [2, 0].map(z => ({ position: new Float32Array([-3, -3, z, 3, -3, z, 0, 3, z]), indices: new Uint32Array([0, 1, 2]) })),
            components: [{ nPoints: 3, nTriangles: 1, featureIndex: 0 }, { nPoints: 3, nTriangles: 1, featureIndex: 1 }],
        });
        const building = layer('buildings') as Triangles3DLayer;
        building.updateLayerRenderInfo({ color: { r: 0, g: 255, b: 0, alpha: 1 } });
        // The nearer roof is submitted first; real depth must keep the farther roof from replacing its ID.
        const roofs = await pixels([], building, [building]);
        assert(roofs[(64 * 128 + 64) * 4] === 1, '3D picking no longer keeps the nearest roof');
        const composite = await pixels([layer('upper')], undefined, [building]);
        const center = rgba(composite, 64, 64);
        assert(center[1] > 80 && center[2] < 5, 'Building composite did not cover the 2D stack');
        map.setLayerOrder(['buildings', 'upper']);
        identical(roofs, await pixels([], building, [building]), 'Building picking adds artificial height');
        identical(composite, await pixels([layer('upper')], undefined, [building]), 'Building geometry adds artificial height');
        checks.push('physical building depth, picking alignment, and composite precedence');
        map.style.setHighlightColor('#0000ff');
        map.style.setHoverColor('#ff0000');
        map.updateRenderInfo('buildings', { isClick: true });
        building.setSelection([0, 1]);
        building.setHoveredIds([0]);
        const hoverColor = rgba(await pixels([], undefined, [building]), 64, 64);
        assert(hoverColor[0] > 80 && hoverColor[2] < 5, `Hover did not override selection color: ${hoverColor}`);
        assert(building.highlightedIds.join(',') === '0,1', 'Hover changed the selection');
        building.setHoveredIds([]);
        const selectionColor = rgba(await pixels([], undefined, [building]), 64, 64);
        assert(selectionColor[2] > 80 && selectionColor[0] < 5, `Clearing hover did not restore selection: ${selectionColor}`);
        map.updateRenderInfo('buildings', { isClick: false });
        checks.push('hover color overrides and restores a building selection without mutating IDs');
        const drawBuilding = () => pixels([], building, [building]);
        await drawBuilding();
        building.toggleHighlightedIds([1]);
        identical(roofs, await stateUploads(drawBuilding, ['Highlighted data buffer']), 'Building click changed picking');
        map.setSkipped('buildings', [0]);
        const rear = await stateUploads(drawBuilding, ['Skipped data buffer', 'Object id buffer']);
        assert(rear[(64 * 128 + 64) * 4] === 2, 'Hidden roof still blocks picking');
        map.setSkipped('buildings', []);
        identical(roofs, await stateUploads(drawBuilding, ['Skipped data buffer', 'Object id buffer']), 'Restored roof did not pick');
        checks.push('building click and hide do not reupload geometry or normals');

        // Run the actual pick coordinator rather than the explicit rendering helper above.
        map.updateRenderInfo('buildings', { isClick: true, isHover: true });
        map.setSelection('buildings', [0, 1]);
        map.camera.resetCamera([0, 1, 0], [0, 0, 0], [0, 0, 13.036753]);
        map.camera.resize(128, 128);
        map.camera.update();
        const flat = (map as unknown as { _flatRenderPath: { renderFrame(pickOnly?: boolean): void } })._flatRenderPath;
        const beginPick = renderer.beginPickingRenderPass;
        const beginMain = renderer.beginMainRenderPass;
        let pickPasses = 0;
        let mainPasses = 0;
        renderer.beginPickingRenderPass = (...args) => { pickPasses++; return beginPick.apply(renderer, args); };
        renderer.beginMainRenderPass = (...args) => { mainPasses++; return beginMain.apply(renderer, args); };
        try {
            const rect = map.canvas.getBoundingClientRect();
            const x = renderer.cssWidth / 2;
            const y = renderer.cssHeight / 2;
            map.queueHover(x, y, rect.left + x, rect.top + y);
            flat.renderFrame(true);
            await device.queue.onSubmittedWorkDone();
            const click = (id: string) => new Promise<number[]>(resolve => {
                const listener = ({ selection }: { selection: number[] }) => {
                    map.events.off(MapEvent.CLICK, listener);
                    resolve(selection);
                };
                map.events.on(MapEvent.CLICK, listener);
                layer(id).layerRenderInfo.pickedComps = [x, y];
                flat.renderFrame(true);
            });
            assert(!(await click('buildings')).includes(0), 'Cached click did not toggle the hovered roof');
            assert(Number(pickPasses) === 1 && Number(mainPasses) === 0, 'Hover and click should share one picking pass and skip the main pass');
            map.setSkipped('buildings', [0]);
            assert((await click('buildings')).length === 0, 'The hidden roof should not block the previously selected rear roof from being toggled');
            assert(Number(pickPasses) === 2, 'Hiding a roof should invalidate the picking cache');
            map.setSkipped('buildings', []);
            building.makeLayerDataDirty();
            assert((await click('buildings')).includes(0), 'Reloaded geometry and restored visibility should pick the front roof');
            assert(Number(pickPasses) === 3, 'Geometry changes should invalidate the picking cache');
            for (const id of ['lower', 'line', 'point']) {
                map.updateRenderInfo(id, { isClick: true });
                map.setSelection(id, []);
                const before = pickPasses;
                assert((await click(id)).includes(0), `${id} cache miss did not pick the active layer`);
                assert(!(await click(id)).includes(0), `${id} cache hit did not toggle selection`);
                assert(pickPasses === before + 1, `${id} should reuse the picking target`);
            }
            map.updateRenderInfo('point', { pointSize: 2 });
            await click('point');
            assert(Number(pickPasses) === 7, 'Point size should invalidate the cache');
            map.camera.resize(256, 128);
            await click('point');
            assert(Number(pickPasses) === 8 && Number(mainPasses) === 0, 'Projection changes should refresh picking without drawing the scene');
            renderer.resize(256, 128, 1);
            await click('point');
            assert(Number(pickPasses) === 9, 'A new picking texture should invalidate the cache');
            renderer.resize(128, 128, 1);
            map.camera.resize(128, 128);
            map.updateRenderInfo('point', { isClick: false, pointSize: 1 });
        } finally {
            renderer.beginPickingRenderPass = beginPick;
            renderer.beginMainRenderPass = beginMain;
            map.updateRenderInfo('buildings', { isClick: false, isHover: false });
        }
        checks.push('flat hover and click share the picking texture without redrawing the map');

        const ui = map.ui as unknown as { makeLayerRow(layer: Layer): HTMLDivElement };
        const labels: string[] = [];
        const icons = new Set<string>();
        for (let i = 0; i < 4; i++) {
            const button = ui.makeLayerRow(building).querySelector<HTMLButtonElement>('button[aria-label^="buildings:"]')!;
            labels.push(button.getAttribute('aria-label')!);
            const icon = button.querySelector('svg');
            assert(icon?.getAttribute('aria-hidden') === 'true', 'Interaction icon must not replace the accessible label');
            icons.add(icon!.innerHTML);
            button.click();
        }
        assert(['Interaction only', 'Hover', 'Click', 'Hover + Click'].every((label, i) =>
            labels[i].startsWith(`buildings: ${label}.`)), `Wrong interaction mode cycle: ${labels.join('; ')}`);
        assert(icons.size === 4, 'Each interaction mode must have a distinct icon');
        assert(!map.activeHoverLayer && !map.activeClickLayer, 'Interaction-only mode still picks or hovers');
        checks.push('layer interaction button cycles through all four modes');

        host.style.transformOrigin = 'top left';
        host.style.transform = 'translate(24px, 16px) scale(0.5)';
        map.camera.resetCamera([0, 1, 0], [0, 0, 0], [0, 0, 13]);
        map.camera.update();
        map.updateRenderInfo('lower', { isClick: true });
        map.setSelection('lower', [0]);
        map.setTooltip('buildings', id => `<Building ${id}>`);
        const hovered: number[][] = [];
        map.events.on(MapEvent.HOVER, ({ selection }) => hovered.push(selection));
        const rect = canvas.getBoundingClientRect();
        const x = rect.left + rect.width * 0.55;
        const y = rect.top + rect.height * 0.55;
        const move = () => canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', clientX: x, clientY: y }));
        const flatPath = (map as unknown as { _flatRenderPath: { renderFrame(): void } })._flatRenderPath;
        move();
        flatPath.renderFrame();
        await device.queue.onSubmittedWorkDone();
        assert(!document.querySelector('[role="tooltip"]') && hovered.length === 0, 'A configured tooltip enabled hover');
        map.updateRenderInfo('buildings', { isHover: true });
        move();
        flatPath.renderFrame();
        let tooltip: HTMLElement | null = null;
        for (let attempt = 0; attempt < 120 && !tooltip; attempt++) {
            await new Promise(resolve => requestAnimationFrame(resolve));
            tooltip = document.querySelector('[role="tooltip"]');
        }
        assert(hovered.length === 1 && hovered[0].join() === '0', `Wrong hover pick on scaled canvas: ${JSON.stringify(hovered)}`);
        assert(tooltip?.textContent === '<Building 0>' && !tooltip.children.length, 'Tooltip was not rendered as plain text');
        const tooltipRect = tooltip!.getBoundingClientRect();
        assert(tooltipRect.left >= rect.left && tooltipRect.right <= rect.right + 1
            && tooltipRect.top >= rect.top && tooltipRect.bottom <= rect.bottom + 1, 'Tooltip escaped the scaled canvas');
        for (const type of ['pointerdown', 'pointerup']) {
            canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'mouse', clientX: x, clientY: y,
                button: 0, buttons: type === 'pointerdown' ? 1 : 0 }));
        }
        assert(hovered.length === 1 && tooltip?.isConnected, 'A stationary single click cleared hover or its tooltip');
        map.setTooltip('buildings', null);
        assert(!document.querySelector('[role="tooltip"]') && map.activeHoverLayer === building, 'Removing the tooltip disabled hover');
        canvas.dispatchEvent(new PointerEvent('pointerleave'));
        assert(hovered.length === 2 && hovered[1].length === 0, 'Pointer leave did not clear hover');
        assert(map.activeClickLayer === layer('lower') && (layer('lower') as unknown as { highlightedIds: number[] }).highlightedIds.join() === '0',
            'Hover or tooltip changed click selection');
        map.updateRenderInfo('buildings', { isHover: false });
        map.updateRenderInfo('lower', { isClick: false });
        host.style.transform = '';
        checks.push('independent hover and tooltip position on a translated and scaled canvas');

        const heightfield = heightfieldFromRaster(raster, 'band', [0, 0]);
        const heights = device.createTexture({ size: [2, 2, 1], format: 'r32float',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
        resources.push(heights);
        device.queue.writeTexture({ texture: heights }, heightfield.data, { bytesPerRow: 8 }, [2, 2]);
        building.setTerrainHeightSource(new StaticHeightSource(heightfield), heights.createView({ dimension: '2d-array' }));
        const raised = await pixels([], building, [building]);
        assert(raised[(64 * 128 + 64) * 4] === 1, 'Terrain-relative building picking missed the nearest roof');
        assert(raised.some((value, i) => value !== roofs[i]), 'Terrain height did not move building geometry');
        map.setLayerOrder(['upper', 'buildings']);
        identical(raised, await pixels([], building, [building]), 'Terrain-relative picking moved with layer order');
        building.clearTerrainHeightSource();
        checks.push('physical terrain height in building geometry and picking');

        // Exercise the same orthographic overlay pass used for terrain draping.
        const overlay = new Camera();
        overlay.setOrthographicBounds(-6, 6, -6, 6);
        const terrainOverlays = () => orderedLayers().filter(target => target === layer('lower') || target === layer('upper'));
        map.setLayerOrder(['upper', 'lower']);
        near(rgba(await pixels(terrainOverlays(), undefined, [], overlay), 64, 64), [255, 0, 0, 255], 'Custom terrain overlay order');
        map.setLayerOrder([]);
        near(rgba(await pixels(terrainOverlays(), undefined, [], overlay), 64, 64), [0, 0, 255, 255], 'Default terrain overlay order');
        checks.push('terrain overlay plane and ordering');

        map.loadCollection('regional', { collection: square(200000), type: 'polygons' });
        map.updateRenderInfo('regional', { showBorders: false });
        map.fitBounds([-200000, -200000, 200000, 200000]);
        const regional = await pixels([layer('regional')], layer('regional'), [], map.camera);
        assert(regional[(64 * 128 + 64) * 4] === 1 && regional[(12 * 128 + 12) * 4] === 1,
            'Large fitted ground is beyond the far clipping plane');
        checks.push('large-area fitting expands the far clipping plane');
        const validation = await device.popErrorScope();
        if (validation) errors.push(validation.message);
        await device.queue.onSubmittedWorkDone();
        assert(errors.length === 0, errors.join('\n'));
        return { status: 'passed', checks };
    } finally {
        for (const resource of resources) resource.destroy();
        map.destroy();
        host.remove();
    }
}
