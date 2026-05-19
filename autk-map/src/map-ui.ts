/**
 * @module AutkMapUi
 * DOM-based user interface controller for `AutkMap`.
 *
 * This module defines the `AutkMapUi` class, which creates and maintains the
 * map's floating UI elements, including the layer menu, thematic legend, and
 * optional performance overlay. It coordinates UI state with map layer render
 * state so that visibility, color-map display, picking, and active-layer
 * selection stay aligned with the current map contents.
 */

import { ColorMap } from './types-core';
import type { ColorRGB } from './types-core';
import { Layer } from './layer';
import { AutkMap } from './map';

import * as d3 from 'd3';

const EYE_SVG = `<svg viewBox="0 0 16 16" width="20" height="20" fill="#555"><path d="M8 3C4.134 3 1 8 1 8s3.134 5 7 5 7-5 7-5-3.134-5-7-5zm0 8.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7zm0-5.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>`;
const RAMP_SVG  = `<svg viewBox="0 0 16 16" width="20" height="20"><rect x="1"   y="6" width="3.5" height="5" rx="1" fill="#4169e1"/><rect x="4.5" y="6" width="3"   height="5"        fill="#44cccc"/><rect x="7.5" y="6" width="3"   height="5"        fill="#fdd34d"/><rect x="10.5" y="6" width="3.5" height="5" rx="1" fill="#e04444"/></svg>`;
const CURSOR_SVG = `<svg viewBox="0 0 16 16" width="20" height="20" fill="#555"><path d="M2 1l4.5 13 2.1-5.1L14 6.8z"/></svg>`;

const DEBUG_FPS = false;

/**
 * Floating DOM UI controller for an `AutkMap` instance.
 *
 * `AutkMapUi` builds lightweight overlay controls in the map canvas container
 * and keeps them synchronized with the current layer stack and render state.
 * It exposes methods for building and tearing down the UI, responding to map
 * resize and layer lifecycle events, and updating legend and performance
 * displays.
 *
 * @example
 * const map = new AutkMap(canvas);
 * await map.init();
 *
 * map.ui.changeActiveLayer(map.layerManager.layers[0] ?? null);
 */
export class AutkMapUi {
    /** Parent map instance used for UI interactions and layer updates. */
    protected _map: AutkMap;
    /** Margin in CSS pixels used to place floating UI panels. */
    protected _uiMargin: number = 10;
    /** Currently active layer shown in the legend panel. */
    protected _activeLayer: Layer | null = null;
    /** Root menu icon element toggling submenu visibility. */
    protected _menuIcon: HTMLDivElement | null = null;
    /** Submenu container listing layers and controls. */
    protected _subMenu: HTMLDivElement | null = null;
    /** Legend panel for thematic colormap display. */
    protected _legend: HTMLDivElement | null = null;
    /** Performance overlay showing smoothed FPS and render time. */
    protected _performanceOverlay: HTMLDivElement | null = null;
    /** Persistent menu toggle handler removed during teardown. */
    protected _onMenuIconClick: ((event: MouseEvent) => void) | null = null;

    /**
     * Creates a UI controller bound to a map instance.
     *
     * The UI is not inserted into the DOM until {@link buildUi} is called.
     *
     * @param map Parent map whose canvas, layers, and update APIs are used by the UI.
     */
    constructor(map: AutkMap) {
        this._map = map;
    }

    /** Parent map reference. */
    get map(): AutkMap { return this._map; }
    /** Updates the parent map reference used by subsequent UI operations. */
    set map(map: AutkMap) { this._map = map; }
    /** Layer currently used for legend display and pick activation. */
    get activeLayer(): Layer | null { return this._activeLayer; }
    /** Sets the cached active layer reference used by legend synchronization. */
    set activeLayer(layer: Layer | null) { this._activeLayer = layer; }

    // ── Resize ────────────────────────────────────────────────────────────────

    /**
     * Repositions floating UI elements to match the canvas location.
     *
     * This should be called after canvas size or page layout changes so the
     * menu, submenu, legend, and performance overlay remain anchored to the
     * correct corners of the map container.
     *
     * @returns Updates the inline position styles of any UI elements that have been built.
     */
    handleResize(): void {
        if (this._menuIcon) {
            this._menuIcon.style.top  = (this.map.canvas.offsetTop  + this._uiMargin) + 'px';
            this._menuIcon.style.left = (this.map.canvas.offsetLeft + this._uiMargin) + 'px';
        }
        if (this._subMenu) {
            this._subMenu.style.top  = (this.map.canvas.offsetTop  + 35 + 2 * this._uiMargin) + 'px';
            this._subMenu.style.left = (this.map.canvas.offsetLeft + this._uiMargin) + 'px';
        }
        if (this._legend) {
            const width  = parseInt(this._legend.style.width  || '0', 10) || 0;
            const height = parseInt(this._legend.style.height || '0', 10) || 0;
            this._legend.style.left = (this.map.canvas.offsetLeft + this.map.canvas.clientWidth  - 2 - width  - this._uiMargin) + 'px';
            this._legend.style.top  = (this.map.canvas.offsetTop  + this.map.canvas.clientHeight - 2 - height - this._uiMargin) + 'px';
        }
        if (this._performanceOverlay) {
            this._performanceOverlay.style.left = (this.map.canvas.offsetLeft + this.map.canvas.clientWidth - 92 - this._uiMargin) + 'px';
            this._performanceOverlay.style.top = (this.map.canvas.offsetTop + this._uiMargin) + 'px';
        }
    }

    // ── Active layer ──────────────────────────────────────────────────────────

    /**
     * Activates a layer for picking and legend display.
     *
     * The provided layer is first validated against the current layer manager.
     * When a valid layer is found, this method makes picking exclusive by
     * disabling `isPick` on every other registered layer before enabling it on
     * the selected one. The legend is then refreshed to reflect the new active
     * layer.
     *
     * Calls with `null` or with a layer object that is no longer the currently
     * registered instance are ignored.
     *
     * @param layer Layer to activate.
     * @returns Updates layer render state and refreshes the legend when activation succeeds.
     */
    changeActiveLayer(layer: Layer | null): void {
        layer = this._resolveActiveLayer(layer);
        if (!layer) return;
        this._activeLayer = layer;

        // Exclusive isPick: disable on all other vector layers
        this._map.layerManager.layers.forEach((l: Layer) => {
            if (l.layerInfo.id !== layer.layerInfo.id) {
                this.map.updateRenderInfo(l.layerInfo.id, { renderInfo: { isPick: false } });
            }
        });

        this.map.updateRenderInfo(layer.layerInfo.id, { renderInfo: { isPick: true } });
        this.updateLegendContent();
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Builds the map UI overlays.
     *
     * This method creates the menu icon, submenu structure, layer list section,
     * legend container, and optional performance overlay. Repeated calls are
     * safe and reuse already-created elements.
     *
     * @returns Ensures the UI DOM structure exists for the current map.
     */
    buildUi(): void {
        this.buildMenuIcon();
        this.buildSubMenu();
        this.buildLayerList();
        this.buildLegend();

        if(DEBUG_FPS) {
            this.buildPerformanceOverlay(); 
        }
    }

    /**
     * Removes all UI DOM nodes, listeners, and cached UI state.
     *
     * After teardown, the instance retains only its map reference. Calling
     * {@link buildUi} again recreates the UI from scratch.
     *
     * @returns Detaches injected elements and clears cached element references.
     */
    destroy(): void {
        if (this._menuIcon && this._onMenuIconClick) {
            this._menuIcon.removeEventListener('click', this._onMenuIconClick);
        }

        this._menuIcon?.remove();
        this._subMenu?.remove();
        this._legend?.remove();
        this._performanceOverlay?.remove();

        this._onMenuIconClick = null;
        this._menuIcon = null;
        this._subMenu = null;
        this._legend = null;
        this._performanceOverlay = null;
        this._activeLayer = null;
    }

    /**
     * Updates the on-screen performance overlay.
     *
     * If the performance overlay has not been created, the call is ignored.
     *
     * @param fps Smoothed frames-per-second value to display.
     * @param frameTimeMs Frame time in milliseconds to display.
     * @returns Updates the overlay contents when the performance UI is enabled.
     */
    updatePerformance(fps: number, frameTimeMs: number): void {
        if (!this._performanceOverlay) {
            return;
        }

        this._performanceOverlay.innerHTML = `<div style="font-weight:600;">${fps.toFixed(1)} fps</div><div>${frameTimeMs.toFixed(1)} ms</div>`;
    }

    /**
     * Clears active-layer UI state after a layer is removed from the map.
     *
     * If the removed layer was the current active layer, the cached reference is
     * cleared before the legend visibility is recomputed.
     *
     * @param layerId Identifier of the removed layer.
     * @returns Synchronizes legend visibility with the remaining layer state.
     */
    handleLayerRemoved(layerId: string): void {
        if (this._activeLayer?.layerInfo.id === layerId) {
            this._activeLayer = null;
        }
        this.syncLegendVisibility();
    }

    /**
     * Refreshes legend state after layer render settings change.
     *
     * If the provided layer is still registered and has color-map rendering
     * enabled, it becomes the active legend layer. The legend container is then
     * shown or hidden according to the resolved active layer state.
     *
     * @param layer Layer whose legend-related state may have changed.
     * @returns Recomputes legend visibility and content for the current active layer.
     */
    refreshLegend(layer: Layer | null): void {
        const resolvedLayer = this._resolveActiveLayer(layer);
        if (resolvedLayer && resolvedLayer.layerRenderInfo.isColorMap) {
            this._activeLayer = resolvedLayer;
        }
        this.syncLegendVisibility();
    }

    /**
     * Rebuilds the layer list when visible layer state changes.
     *
     * This method is intended to be called after updates to render flags such as
     * `isSkip`, `isPick`, or `isColorMap`. To avoid unnecessary DOM work, the
     * list is repopulated only while the submenu is currently visible.
     *
     * @returns Re-renders the visible layer rows when the submenu is open.
     */
    refreshLayerList(): void {
        if (this._subMenu?.style.visibility !== 'visible') return;
        this.populateLayerList();
    }

    // ── State sync ────────────────────────────────────────────────────────────

    /**
     * Synchronizes legend visibility with the current active layer.
     *
     * The cached active layer is first validated against the current layer
     * manager. The legend is visible only when that resolved layer exists and
     * has color-map rendering enabled.
     *
     * @returns Updates legend visibility and redraws legend contents.
     */
    protected syncLegendVisibility(): void {
        if (!this._legend) return;
        this._activeLayer = this._resolveActiveLayer(this._activeLayer);
        const isColorMap = this._activeLayer?.layerRenderInfo.isColorMap ?? false;
        this._legend.style.visibility = isColorMap ? 'visible' : 'hidden';
        this.updateLegendContent();
    }

    // ── Build structure (idempotent) ───────────────────────────────────────────

    /**
     * Creates the floating menu toggle button.
     *
     * The button is positioned relative to the map canvas and toggles submenu
     * visibility on click. When opening the submenu, the layer list is
     * repopulated so the displayed rows reflect current map state.
     *
     * Repeated calls are ignored after the element has been created.
     *
     * @returns Inserts the menu button into the canvas parent element.
     */
    protected buildMenuIcon(): void {
        if (this._menuIcon) return;

        this._menuIcon = document.createElement('div');
        this._menuIcon.id = 'autkMapUi';
        Object.assign(this._menuIcon.style, {
            width: '40px', height: '40px', position: 'absolute', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: '11',
            backgroundColor: '#fff', border: 'none', borderRadius: '10px',
            cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            fontFamily: 'system-ui, sans-serif',
            top:  (this.map.canvas.offsetTop  + this._uiMargin) + 'px',
            left: (this.map.canvas.offsetLeft + this._uiMargin) + 'px',
        });

        this._menuIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
            <rect x="8"  y="10"   rx="1.5" ry="1.5" width="24" height="3.5" fill="#666" stroke="none"></rect>
            <rect x="8"  y="18.5" rx="1.5" ry="1.5" width="24" height="3.5" fill="#666" stroke="none"></rect>
            <rect x="8"  y="27"   rx="1.5" ry="1.5" width="24" height="3.5" fill="#666" stroke="none"></rect>
        </svg>`;

        this.map.canvas.parentElement?.appendChild(this._menuIcon);

        this._onMenuIconClick = (e) => {
            e.stopPropagation();
            if (!this._subMenu) return;
            const opening = this._subMenu.style.visibility !== 'visible';
            if (opening) this.populateLayerList();
            this._subMenu.style.visibility = opening ? 'visible' : 'hidden';
        };
        this._menuIcon.addEventListener('click', this._onMenuIconClick);
    }

    /**
     * Creates the submenu container used for layer controls.
     *
     * The container is initially hidden and positioned below the main menu
     * button. It serves as the parent for layer-related headings and rows.
     *
     * Repeated calls are ignored after the element has been created.
     *
     * @returns Inserts the submenu container into the canvas parent element.
     */
    protected buildSubMenu(): void {
        if (this._subMenu) return;

        this._subMenu = document.createElement('div');
        this._subMenu.id = 'autkMapSubMenu';
        Object.assign(this._subMenu.style, {
            position: 'absolute', width: '260px', display: 'block', zIndex: '11',
            backgroundColor: '#fff', border: 'none', borderRadius: '10px',
            padding: '0', visibility: 'hidden',
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            fontFamily: 'system-ui, sans-serif', fontSize: '14px',
            overflow: 'hidden',
            top:  (this.map.canvas.offsetTop  + 35 + 2 * this._uiMargin) + 'px',
            left: (this.map.canvas.offsetLeft + this._uiMargin) + 'px',
        });

        this.map.canvas.parentElement?.appendChild(this._subMenu);
    }

    /**
     * Creates the layer list section inside the submenu.
     *
     * This method adds the static heading and the container later populated by
     * {@link populateLayerList}. If the section already exists, the call is
     * ignored.
     *
     * @returns Ensures the submenu contains the layer-list structure.
     */
    protected buildLayerList(): void {
        if (!this._subMenu || this._subMenu.querySelector('#layersTitle')) return;

        this._subMenu.appendChild(this.makeHeading('layersTitle', 'Layers'));

        const section = document.createElement('div');
        section.id = 'layerListSection';
        Object.assign(section.style, { padding: '4px 0 6px' });
        this._subMenu.appendChild(section);
    }

    /**
     * Creates the floating legend container.
     *
     * The legend is positioned in the lower-right corner of the map canvas and
     * remains hidden until an active layer with color-map rendering is available.
     *
     * Repeated calls are ignored after the element has been created.
     *
     * @param width Legend width in CSS pixels.
     * @param height Legend height in CSS pixels.
     * @returns Inserts the legend container into the canvas parent element.
     */
    protected buildLegend(width = 250, height = 80): void {
        if (this._legend) return;

        this._legend = document.createElement('div');
        this._legend.id = 'autkMapLegend';
        Object.assign(this._legend.style, {
            position: 'absolute', display: 'block', zIndex: '11', visibility: 'hidden',
            backgroundColor: '#fff', border: 'none', borderRadius: '10px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            fontFamily: 'system-ui, sans-serif', fontSize: '14px',
            width: width + 'px', height: height + 'px',
            left: (this.map.canvas.offsetLeft + this.map.canvas.clientWidth  - 2 - width  - this._uiMargin) + 'px',
            top:  (this.map.canvas.offsetTop  + this.map.canvas.clientHeight - 2 - height - this._uiMargin) + 'px',
        });

        this.map.canvas.parentElement?.appendChild(this._legend);
    }

    /**
     * Creates the optional performance overlay.
     *
     * The overlay is positioned near the upper-right corner of the map canvas
     * and displays FPS and frame time values supplied through
     * {@link updatePerformance}. Repeated calls are ignored after the element
     * has been created.
     *
     * @returns Inserts the performance overlay into the canvas parent element.
     */
    protected buildPerformanceOverlay(): void {
        if (this._performanceOverlay) return;

        this._performanceOverlay = document.createElement('div');
        this._performanceOverlay.id = 'autkMapPerformanceOverlay';
        Object.assign(this._performanceOverlay.style, {
            position: 'absolute', display: 'block', zIndex: '11',
            minWidth: '82px', padding: '8px 10px',
            backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: '10px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            fontFamily: 'system-ui, sans-serif', fontSize: '12px', color: '#222',
            textAlign: 'right',
            left: (this.map.canvas.offsetLeft + this.map.canvas.clientWidth - 92 - this._uiMargin - 10) + 'px',
            top: (this.map.canvas.offsetTop + this._uiMargin) + 'px',
        });
        this._performanceOverlay.innerHTML = '<div style="font-weight:600;">0.0 fps</div><div>0.0 ms</div>';

        this.map.canvas.parentElement?.appendChild(this._performanceOverlay);
    }

    // ── Layer list population ─────────────────────────────────────────────────

    /**
     * Repopulates the submenu with one row per current layer.
     *
     * Existing row content is cleared before rows are rebuilt in the current
     * layer-manager order.
     *
     * @returns Recreates the layer list DOM when the section is available.
     */
    protected populateLayerList(): void {
        const section = this._subMenu?.querySelector('#layerListSection') as HTMLDivElement | null;
        if (!section) return;
        section.innerHTML = '';

        const all = this.map.layerManager.layers;
        for (const layer of all) {
            section.appendChild(this.makeLayerRow(layer));
        }
    }

    // ── Legend content ────────────────────────────────────────────────────────

    /**
     * Renders the legend contents for the active layer.
     *
     * The active layer is first validated against the current map state. When no
     * valid active layer remains, the legend contents are cleared. Otherwise,
     * this method renders the layer title and a color ramp derived from the
     * layer's colormap interpolator and computed labels.
     *
     * Categorical color schemes are truncated to the supported scheme size,
     * while continuous schemes render a 100-step ramp.
     *
     * @param width Legend width in CSS pixels.
     * @param height Legend height in CSS pixels.
     * @returns Rebuilds the legend DOM for the resolved active layer.
     */
    protected updateLegendContent(width = 250, height = 80): void {
        if (!this._legend) return;

        this._activeLayer = this._resolveActiveLayer(this._activeLayer);
        if (!this._activeLayer) {
            this._legend.innerHTML = '';
            return;
        }

        this._legend.innerHTML = '';

        const title = document.createElement('div');
        title.textContent = this._activeLayer.layerInfo.id;
        Object.assign(title.style, {
            padding: '10px 14px 6px', fontWeight: '600', fontSize: '14px',
            color: '#222', borderBottom: '1px solid #e8e8e8', textAlign: 'center',
        });
        this._legend.appendChild(title);

        const padding     = this._uiMargin;
        const titleHeight = 40;
        const innerWidth  = width - 4 * padding;
        const innerHeight = height - titleHeight;

        const interpolator = this._activeLayer.layerRenderInfo.colormap.config.interpolator;
        const labels       = this._activeLayer.layerRenderInfo.colormap.computedLabels ?? [];
        const categoricalSize = ColorMap.getCategoricalSchemeSize(interpolator);
        const isCategorical   = categoricalSize !== null;
        const res             = isCategorical ? categoricalSize : 100;
        const slc             = isCategorical ? Math.min(labels.length, categoricalSize) : 100;
        const colorMap     = ColorMap.getColorArray(interpolator, res).slice(0, slc);

        const svg       = d3.select(this._legend).append('svg').attr('width', width).attr('height', innerHeight);
        const rectWidth = innerWidth / colorMap.length;
        const rectH     = innerHeight * 0.3;
        const g         = svg.append('g').attr('transform', `translate(${2 * padding}, 0)`);

        g.selectAll<SVGRectElement, ColorRGB>('rect').data(colorMap).join('rect')
            .attr('x', (_d, i) => i * rectWidth).attr('y', 0)
            .attr('width', rectWidth).attr('height', rectH)
            .style('fill',   (d) => `rgb(${d.r},${d.g},${d.b})`)
            .style('stroke', (d) => `rgb(${d.r},${d.g},${d.b})`)
            .style('stroke-width', '1px');

        const textData = labels.map((d, i) => ({
            label: d,
            pos: isCategorical
                ? i * rectWidth + rectWidth / 2
                : i * (innerWidth / (labels.length - 1)),
        }));

        g.selectAll('text').data(textData).join('text')
            .text((d) => d.label)
            .attr('x', (d) => d.pos).attr('y', rectH + 12)
            .style('font-size', '12px').style('fill', '#333').style('text-anchor', 'middle');
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Creates a layer-list row with visibility, color-map, and pick controls.
     *
     * Raster layers do not receive a picking button because they cannot be made
     * the active picking layer by this UI.
     *
     * @param layer Layer represented by the row.
     * @returns Newly created DOM row for the layer list.
     */
    private makeLayerRow(layer: Layer): HTMLDivElement {
        const row = document.createElement('div');
        Object.assign(row.style, {
            display: 'flex', alignItems: 'center', gap: '2px',
            padding: '4px 10px 4px 14px',
        });

        const eyeBtn = this.makeIconButton(EYE_SVG, !layer.layerRenderInfo.isSkip, () => {
            this.map.updateRenderInfo(layer.layerInfo.id, { renderInfo: { isSkip: !layer.layerRenderInfo.isSkip } });
        });

        const paletteBtn = this.makeIconButton(RAMP_SVG, layer.layerRenderInfo.isColorMap ?? false, () => {
            this.map.updateRenderInfo(layer.layerInfo.id, { renderInfo: { isColorMap: !layer.layerRenderInfo.isColorMap } });
        });

        const isRaster = layer.layerInfo.typeLayer === 'raster';
        const cursorBtn = isRaster
            ? (() => { const s = document.createElement('span'); s.style.width = '28px'; s.style.flexShrink = '0'; return s; })()
            : this.makeIconButton(CURSOR_SVG, layer.layerRenderInfo.isPick ?? false, () => {
                this.changeActiveLayer(this.map.layerManager.searchByLayerId(layer.layerInfo.id));
            });

        const nameEl = document.createElement('span');
        nameEl.textContent = layer.layerInfo.id;
        Object.assign(nameEl.style, {
            flex: '1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontSize: '13px', color: '#333', marginLeft: '4px',
        });

        row.appendChild(eyeBtn);
        row.appendChild(paletteBtn);
        row.appendChild(cursorBtn);
        row.appendChild(nameEl);
        return row;
    }

    /**
     * Creates a compact icon button for a layer-row action.
     *
     * The button's opacity reflects whether the corresponding action is
     * currently active.
     *
     * @param svg Inline SVG markup displayed inside the button.
     * @param active Whether the action is currently enabled.
     * @param onClick Click handler invoked when the button is pressed.
     * @returns Configured button element.
     */
    private makeIconButton(svg: string, active: boolean, onClick: () => void): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.innerHTML = svg;
        Object.assign(btn.style, {
            width: '28px', height: '28px', flexShrink: '0',
            border: 'none', borderRadius: '4px', cursor: 'pointer',
            background: 'none', padding: '2px', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            opacity: active ? '1' : '0.25',
        });
        btn.addEventListener('click', onClick);
        return btn;
    }

    /**
     * Creates a styled submenu or legend heading element.
     *
     * @param id Element id assigned to the heading.
     * @param text Visible heading text.
     * @returns Styled heading element.
     */
    private makeHeading(id: string, text: string): HTMLDivElement {
        const d = document.createElement('div');
        d.id = id;
        d.textContent = text;
        Object.assign(d.style, {
            padding: '10px 14px 6px', fontWeight: '600', fontSize: '14px',
            color: '#222', borderBottom: '1px solid #e8e8e8',
        });
        return d;
    }

    /**
     * Resolves a cached layer reference against the current layer manager.
     *
     * This guards against stale references after layers are removed or replaced.
     * The layer is returned only when the current manager resolves the same
     * object instance for the layer id.
     *
     * @param layer Candidate layer reference.
     * @returns The current registered layer instance, or `null` when the reference is stale.
     */
    private _resolveActiveLayer(layer: Layer | null): Layer | null {
        if (!layer) {
            return null;
        }

        const currentLayer = this.map.layerManager.searchByLayerId(layer.layerInfo.id);
        return currentLayer === layer ? currentLayer : null;
    }
}
