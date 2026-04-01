import { ColorMap } from 'autk-core';
import { ColorMapInterpolator } from './index.js';
import { Layer } from './layer.js';
import { AutkMap } from './main.js';

import * as d3 from 'd3';

const EYE_SVG = `<svg viewBox="0 0 16 16" width="20" height="20" fill="#555"><path d="M8 3C4.134 3 1 8 1 8s3.134 5 7 5 7-5 7-5-3.134-5-7-5zm0 8.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7zm0-5.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>`;
const RAMP_SVG  = `<svg viewBox="0 0 16 16" width="20" height="20"><rect x="1"   y="6" width="3.5" height="5" rx="1" fill="#4169e1"/><rect x="4.5" y="6" width="3"   height="5"        fill="#44cccc"/><rect x="7.5" y="6" width="3"   height="5"        fill="#fdd34d"/><rect x="10.5" y="6" width="3.5" height="5" rx="1" fill="#e04444"/></svg>`;
const CURSOR_SVG = `<svg viewBox="0 0 16 16" width="20" height="20" fill="#555"><path d="M2 1l4.5 13 2.1-5.1L14 6.8z"/></svg>`;

export class AutkMapUi {
    protected _map: AutkMap;
    protected _uiMargin: number = 10;
    protected _activeLayer: Layer | null = null;
    protected _menuIcon: HTMLDivElement | null = null;
    protected _subMenu: HTMLDivElement | null = null;
    protected _legend: HTMLDivElement | null = null;

    constructor(map: AutkMap) {
        this._map = map;
    }

    get map(): AutkMap { return this._map; }
    set map(map: AutkMap) { this._map = map; }
    get activeLayer(): Layer | null { return this._activeLayer; }
    set activeLayer(layer: Layer | null) { this._activeLayer = layer; }

    // ── Resize ────────────────────────────────────────────────────────────────

    public handleResize(): void {
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
    }

    // ── Active layer ──────────────────────────────────────────────────────────

    public changeActiveLayer(layer: Layer | null): void {
        if (!layer) return;
        this._activeLayer = layer;

        // Exclusive isPick: disable on all other vector layers
        this.map.layerManager.vectorLayers.forEach(l => {
            if (l.layerInfo.id !== layer.layerInfo.id) {
                this.map.updateLayerRenderInfo(l.layerInfo.id, { isPick: false });
            }
        });

        this.map.updateLayerRenderInfo(layer.layerInfo.id, { isPick: true });
        this.updateLegendContent();
    }

    // ── Public API ────────────────────────────────────────────────────────────

    public buildUi(): void {
        this.buildMenuIcon();
        this.buildSubMenu();
        this.buildLayerList();
        this.buildLegend();
    }

    /**
     * Called from updateLayerRenderInfo when isColorMap / colorMapLabels /
     * colorMapInterpolator changes. Updates the legend to reflect new state.
     */
    public refreshLegend(layer: Layer | null): void {
        if (layer && layer.layerRenderInfo.isColorMap) {
            this._activeLayer = layer;
        }
        this.syncLegendVisibility();
    }

    /**
     * Called from updateLayerRenderInfo when isSkip / isPick / isColorMap
     * changes. Re-renders the layer list rows if the menu is open.
     */
    public refreshLayerList(): void {
        if (this._subMenu?.style.visibility !== 'visible') return;
        this.populateLayerList();
    }

    // ── State sync ────────────────────────────────────────────────────────────

    protected syncLegendVisibility(): void {
        if (!this._legend) return;
        const isColorMap = this._activeLayer?.layerRenderInfo.isColorMap ?? false;
        this._legend.style.visibility = isColorMap ? 'visible' : 'hidden';
        this.updateLegendContent();
    }

    // ── Build structure (idempotent) ───────────────────────────────────────────

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

        this._menuIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!this._subMenu) return;
            const opening = this._subMenu.style.visibility !== 'visible';
            if (opening) this.populateLayerList();
            this._subMenu.style.visibility = opening ? 'visible' : 'hidden';
        });
    }

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

    protected buildLayerList(): void {
        if (!this._subMenu || this._subMenu.querySelector('#layersTitle')) return;

        this._subMenu.appendChild(this.makeHeading('layersTitle', 'Layers'));

        const section = document.createElement('div');
        section.id = 'layerListSection';
        Object.assign(section.style, { padding: '4px 0 6px' });
        this._subMenu.appendChild(section);
    }

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

    // ── Layer list population ─────────────────────────────────────────────────

    protected populateLayerList(): void {
        const section = this._subMenu?.querySelector('#layerListSection') as HTMLDivElement | null;
        if (!section) return;
        section.innerHTML = '';

        const all: Layer[] = [...this.map.layerManager.vectorLayers, ...this.map.layerManager.rasterLayers];
        for (const layer of all) {
            section.appendChild(this.makeLayerRow(layer));
        }
    }

    // ── Legend content ────────────────────────────────────────────────────────

    protected updateLegendContent(width = 250, height = 80): void {
        if (!this._legend || !this._activeLayer) return;

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

        const interpolator = this._activeLayer.layerRenderInfo.colorMapInterpolator;
        const labels       = this._activeLayer.layerRenderInfo.colorMapLabels;
        const res          = interpolator === ColorMapInterpolator.OBSERVABLE10 ? 10 : 100;
        const slc          = interpolator === ColorMapInterpolator.OBSERVABLE10 ? Math.min(labels.length, 10) : 100;
        const colorMap     = ColorMap.getColorArray(interpolator, res).slice(0, slc);

        const svg       = d3.select(this._legend).append('svg').attr('width', width).attr('height', innerHeight);
        const rectWidth = innerWidth / colorMap.length;
        const rectH     = innerHeight * 0.3;
        const g         = svg.append('g').attr('transform', `translate(${2 * padding}, 0)`);

        g.selectAll('rect').data(colorMap).join('rect')
            .attr('x', (_d, i) => i * rectWidth).attr('y', 0)
            .attr('width', rectWidth).attr('height', rectH)
            .style('fill',   (d) => `rgb(${d.r},${d.g},${d.b})`)
            .style('stroke', (d) => `rgb(${d.r},${d.g},${d.b})`)
            .style('stroke-width', '1px');

        const textData = labels.map((d, i) => ({
            label: d,
            pos: interpolator === ColorMapInterpolator.OBSERVABLE10
                ? i * rectWidth + rectWidth / 2
                : i * (innerWidth / (labels.length - 1)),
        }));

        g.selectAll('text').data(textData).join('text')
            .text((d) => d.label.substring(0, 3))
            .attr('x', (d) => d.pos).attr('y', rectH + 12)
            .style('font-size', '12px').style('fill', '#333').style('text-anchor', 'middle');
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private makeLayerRow(layer: Layer): HTMLDivElement {
        const row = document.createElement('div');
        Object.assign(row.style, {
            display: 'flex', alignItems: 'center', gap: '2px',
            padding: '4px 10px 4px 14px',
        });

        const eyeBtn = this.makeIconButton(EYE_SVG, !layer.layerRenderInfo.isSkip, () => {
            this.map.updateLayerRenderInfo(layer.layerInfo.id, { isSkip: !layer.layerRenderInfo.isSkip });
        });

        const paletteBtn = this.makeIconButton(RAMP_SVG, layer.layerRenderInfo.isColorMap ?? false, () => {
            this.map.updateLayerRenderInfo(layer.layerInfo.id, { isColorMap: !layer.layerRenderInfo.isColorMap });
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
}
