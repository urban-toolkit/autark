import { ColorMap } from './colormap.js';
import { ColorMapInterpolator } from './index.js';
import { Layer } from './layer.js';
import { AutkMap } from './main.js';

import * as d3 from 'd3';

export class AutkMapUi {
    protected _map: AutkMap;
    protected _uiMargin: number = 10;
    protected _activeLayer: Layer | null = null;
    protected _menuIcon: HTMLDivElement | null = null;
    protected _subMenu: HTMLDivElement | null = null;
    protected _legend: HTMLDivElement | null = null;
    private _docClickHandler: (() => void) | null = null;

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
        console.log(`Active layer: ${this._activeLayer.layerInfo.id}`);

        // Disable picking/thematic on all other vector layers
        this.map.layerManager.vectorLayers.forEach(l => {
            if (l.layerInfo.id === this._activeLayer?.layerInfo.id) return;
            this.map.updateRenderInfoProperty(l.layerInfo.id, 'isPick', false);
            this.map.updateRenderInfoProperty(l.layerInfo.id, 'isColorMap', false);
        });

        this.map.updateRenderInfoProperty(this._activeLayer.layerInfo.id, 'isPick', true);

        // Reflect checkbox state onto the newly active layer
        const check = this._subMenu?.querySelector('#showThematicCheckbox') as HTMLInputElement | null;
        if (check) {
            this.map.updateRenderInfoProperty(this._activeLayer.layerInfo.id, 'isColorMap', check.checked);
        }

        this.updateLegendContent();
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Build all UI elements once. Called from AutkMap.init().
     */
    public buildUi(): void {
        this.buildMenuIcon();
        this.buildSubMenu();
        this.buildVisibleLayersDropdown();
        this.buildActiveLayerDropdown();
        this.buildLegendCheckbox();
        this.buildLegend();
        this.addDocClickHandler();
    }

    /**
     * Called externally (e.g. from updateRenderInfoProperty) when isColorMap changes.
     * Updates the legend and checkbox to reflect the new state.
     */
    public refreshLegend(layer: Layer | null): void {
        // Only take ownership of _activeLayer when a layer is being made thematic
        if (layer && layer.layerRenderInfo.isColorMap) {
            this._activeLayer = layer;
        }
        this.syncLegendVisibility();
        this.syncCheckbox();
    }

    // ── State sync (called on menu open and on external state changes) ─────────

    protected syncCheckbox(): void {
        const checkbox = this._subMenu?.querySelector('#showThematicCheckbox') as HTMLInputElement | null;
        if (checkbox) {
            checkbox.checked = this._activeLayer?.layerRenderInfo.isColorMap ?? false;
        }
    }

    protected syncLegendVisibility(): void {
        if (!this._legend) return;
        const isColorMap = this._activeLayer?.layerRenderInfo.isColorMap ?? false;
        this._legend.style.visibility = isColorMap ? 'visible' : 'hidden';
        this.updateLegendContent();
    }

    protected syncLayerLists(): void {
        this.populateVisibleLayersList();
        this.populateActiveLayersList();
    }

    // ── Build structure (each method is idempotent) ────────────────────────────

    protected buildMenuIcon(): void {
        if (this._menuIcon) return;

        this._menuIcon = document.createElement('div');
        this._menuIcon.id = 'autkMapUi';
        Object.assign(this._menuIcon.style, {
            width: '40px', height: '40px', position: 'absolute', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: '11',
            backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '6px',
            cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
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
            if (opening) {
                this.syncLayerLists();
                this.syncCheckbox();
            }
            this._subMenu.style.visibility = opening ? 'visible' : 'hidden';
        });
    }

    protected buildSubMenu(): void {
        if (this._subMenu) return;

        this._subMenu = document.createElement('div');
        this._subMenu.id = 'autkMapSubMenu';
        Object.assign(this._subMenu.style, {
            position: 'absolute', width: '300px', display: 'block', zIndex: '11',
            backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '8px',
            padding: '10px', visibility: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            top:  (this.map.canvas.offsetTop  + 35 + 2 * this._uiMargin) + 'px',
            left: (this.map.canvas.offsetLeft + this._uiMargin) + 'px',
        });

        this.map.canvas.parentElement?.appendChild(this._subMenu);
    }

    protected buildVisibleLayersDropdown(): void {
        if (!this._subMenu || this._subMenu.querySelector('#visibleLayersTitle')) return;

        this._subMenu.appendChild(this.makeHeading('visibleLayersTitle', 'Visible Layers', '0 0 10px 0'));
        this._subMenu.appendChild(this.makeSeparator('visibleLayersSeparator'));

        const { container } = this.makeDropdownShell(
            'visibleLayerDropdownContainer',
            'visibleLayerDropdownButton',
            'visibleLayerDropdownList',
        );
        this._subMenu.appendChild(container);
    }

    protected buildActiveLayerDropdown(): void {
        if (!this._subMenu || this._subMenu.querySelector('#activeLayersTitle')) return;

        this._subMenu.appendChild(this.makeHeading('activeLayersTitle', 'Active Layer', '30px 0 10px 0'));
        this._subMenu.appendChild(this.makeSeparator('activeLayersSeparator'));

        const { container } = this.makeDropdownShell(
            'activeLayersDropdownContainer',
            'activeLayersDropdownButton',
            'activeLayersDropdownList',
        );
        this._subMenu.appendChild(container);
    }

    protected buildLegendCheckbox(): void {
        if (!this._subMenu || this._subMenu.querySelector('#showThematicCheckboxLabel')) return;

        const label = document.createElement('label');
        label.id = 'showThematicCheckboxLabel';
        Object.assign(label.style, { display: 'flex', alignItems: 'center', cursor: 'pointer' });

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = 'showThematicCheckbox';
        checkbox.style.marginRight = '10px';
        checkbox.checked = this._activeLayer?.layerRenderInfo.isColorMap ?? false;

        checkbox.addEventListener('change', (e) => {
            if (!this._activeLayer) return;
            const checked = (e.target as HTMLInputElement).checked;
            this.map.updateRenderInfoProperty(this._activeLayer.layerInfo.id, 'isColorMap', checked);
        });

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode('Thematic Data'));
        this._subMenu.appendChild(label);
    }

    protected buildLegend(width = 250, height = 80): void {
        if (this._legend) return;

        this._legend = document.createElement('div');
        this._legend.id = 'autkMapLegend';
        Object.assign(this._legend.style, {
            position: 'absolute', display: 'block', zIndex: '11', visibility: 'hidden',
            backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '8px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            width: width + 'px', height: height + 'px',
            left: (this.map.canvas.offsetLeft + this.map.canvas.clientWidth  - 2 - width  - this._uiMargin) + 'px',
            top:  (this.map.canvas.offsetTop  + this.map.canvas.clientHeight - 2 - height - this._uiMargin) + 'px',
        });

        this.map.canvas.parentElement?.appendChild(this._legend);
    }

    // ── List population (called each time the menu opens) ─────────────────────

    protected populateVisibleLayersList(): void {
        const list = this._subMenu?.querySelector('#visibleLayerDropdownList') as HTMLDivElement | null;
        if (!list) return;
        list.innerHTML = '';

        const all: Layer[] = [...this.map.layerManager.vectorLayers, ...this.map.layerManager.rasterLayers];
        for (const layer of all) {
            const { label, checkbox } = this.makeCheckboxRow(layer.layerInfo.id, !layer.layerRenderInfo.isSkip);
            checkbox.addEventListener('change', (e) => {
                layer.layerRenderInfo.isSkip = !(e.target as HTMLInputElement).checked;
            });
            list.appendChild(label);
        }
    }

    protected populateActiveLayersList(): void {
        const list = this._subMenu?.querySelector('#activeLayersDropdownList') as HTMLDivElement | null;
        if (!list) return;
        list.innerHTML = '';

        const layers: Layer[] = this.map.layerManager.vectorLayers;
        layers.forEach((layer, idx) => {
            const isActive = this._activeLayer
                ? layer.layerInfo.id === this._activeLayer.layerInfo.id
                : idx === layers.length - 1;

            const label = document.createElement('label');
            Object.assign(label.style, { display: 'flex', alignItems: 'center', padding: '4px 12px', cursor: 'pointer' });

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'activeLayerRadio';
            radio.className = 'active-layer-radio';
            radio.value = layer.layerInfo.id;
            radio.checked = isActive;
            radio.style.marginRight = '8px';

            if (isActive && !this._activeLayer) {
                this.changeActiveLayer(this.map.layerManager.searchByLayerId(layer.layerInfo.id));
            }

            radio.addEventListener('change', () => {
                this.changeActiveLayer(this.map.layerManager.searchByLayerId(layer.layerInfo.id));
            });

            label.appendChild(radio);
            label.appendChild(document.createTextNode(layer.layerInfo.id));
            list.appendChild(label);
        });
    }

    // ── Legend content ────────────────────────────────────────────────────────

    protected updateLegendContent(width = 250, height = 80): void {
        if (!this._legend || !this._activeLayer) return;

        this._legend.innerHTML = '';

        const title = document.createElement('h4');
        title.textContent = this._activeLayer.layerInfo.id;
        Object.assign(title.style, { margin: `${this._uiMargin}px`, fontSize: '14px', color: '#333', textAlign: 'center' });
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

    private addDocClickHandler(): void {
        if (this._docClickHandler) return;
        this._docClickHandler = () => {
            const vList = this._subMenu?.querySelector('#visibleLayerDropdownList') as HTMLElement | null;
            const aList = this._subMenu?.querySelector('#activeLayersDropdownList') as HTMLElement | null;
            if (vList) vList.style.display = 'none';
            if (aList) aList.style.display = 'none';
        };
        document.addEventListener('click', this._docClickHandler);
    }

    private makeHeading(id: string, text: string, margin: string): HTMLHeadingElement {
        const h = document.createElement('h3');
        h.id = id;
        h.textContent = text;
        Object.assign(h.style, { margin, fontSize: '16px', color: '#333' });
        return h;
    }

    private makeSeparator(id: string): HTMLHRElement {
        const hr = document.createElement('hr');
        hr.id = id;
        hr.style.margin = '10px 0';
        return hr;
    }

    private makeDropdownShell(containerId: string, buttonId: string, listId: string) {
        const container = document.createElement('div');
        container.id = containerId;
        Object.assign(container.style, { position: 'relative', marginBottom: '10px' });

        const button = document.createElement('button');
        button.id = buttonId;
        button.textContent = 'Select Layers';
        Object.assign(button.style, {
            width: '100%', padding: '6px 12px', border: '1px solid #ccc',
            borderRadius: '4px', background: '#f9f9f9', cursor: 'pointer', textAlign: 'left',
        });
        container.appendChild(button);

        const list = document.createElement('div');
        list.id = listId;
        Object.assign(list.style, {
            position: 'absolute', top: '110%', left: '0', width: '99%',
            background: '#f9f9f9', border: '1px solid #ccc', borderRadius: '4px',
            display: 'none', zIndex: '12', maxHeight: '200px', overflowY: 'auto', padding: '8px 0',
        });
        container.appendChild(list);

        button.addEventListener('click', (e) => {
            e.stopPropagation();
            list.style.display = list.style.display === 'block' ? 'none' : 'block';
        });

        return { container, button, list };
    }

    private makeCheckboxRow(labelText: string, checked: boolean) {
        const label = document.createElement('label');
        Object.assign(label.style, { display: 'flex', alignItems: 'center', padding: '4px 12px', cursor: 'pointer' });

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = checked;
        checkbox.style.marginRight = '8px';

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(labelText));
        return { label, checkbox };
    }
}
