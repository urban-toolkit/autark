import { ColorMap } from './colormap.js';
import { ColorMapInterpolator } from './index.js';
import { Layer } from './layer.js';
import { AutkMap } from './main.js';

import * as d3 from 'd3';

/**
 * Map UI class for managing the user interface elements of the map.
 */
export class AutkMapUi {
    /**
     * Reference to the AutkMap instance.
     * @type {AutkMap}
     */
    protected _map: AutkMap

    /** UI margin for positioning elements */
    protected _uiMargin: number = 10;

    /**
     * Currently selected layer in the UI.
     * @type {Layer | null}
     */
    protected _activeLayer: Layer | null;

    /**
     * Reference to the menu icon HTML element.
     * @type {HTMLDivElement | null}
     */
    protected _menuIcon: HTMLDivElement | null = null;

    /**
     * Reference to the submenu HTML element.
     * @type {HTMLDivElement | null}
     */
    protected _subMenu: HTMLDivElement | null = null;

    /**
     * Reference to the legend HTML element.
     * @type {HTMLDivElement | null}
     */
    protected _legend: HTMLDivElement | null = null;

    /**
     * Constructor for AutkMapUi
     * @param {AutkMap} map The map instance
     */
    constructor(map: AutkMap) {
        this._map = map;
        this._activeLayer = null;
    }

    /**
     * Get the map instance.
     * @returns {AutkMap} - The map instance.
     */
    get map(): AutkMap {
        return this._map;
    }

    /**
     * Set the map instance.
     * @param {AutkMap} map - The map instance to set.
     */
    set map(map: AutkMap) {
        this._map = map;
    }

    /**
     * Get the current layer in the UI.
     * @returns {Layer | null} - The currently selected layer or null if none is selected.
     */
    get activeLayer(): Layer | null {
        return this._activeLayer;
    }

    /**
     * Set the current layer in the UI.
     * @param {Layer | null} layer - The layer to set as current or null to clear.
     */
    set activeLayer(layer: Layer | null) {
        this._activeLayer = layer;
    }

    public handleResize(): void {
        // Update menu icon position
        if (this._menuIcon) {
            this._menuIcon.style.top = (this.map.canvas.offsetTop + this._uiMargin) + 'px';
            this._menuIcon.style.left = (this.map.canvas.offsetLeft + this._uiMargin) + 'px';
        }

        // Update submenu position
        if (this._subMenu) {
            this._subMenu.style.top = (this.map.canvas.offsetTop + 30 + 2 * this._uiMargin) + 'px';
            this._subMenu.style.left = (this.map.canvas.offsetLeft + this._uiMargin) + 'px';
        }
        
        // Update legend position (bottom-right of canvas)
        if (this._legend) {
            const width = parseInt(this._legend.style.width || '0', 10) || 0;
            const height = parseInt(this._legend.style.height || '0', 10) || 0;
            // Position bottom-right relative to the canvas
            this._legend.style.left = (this.map.canvas.offsetLeft + this.map.canvas.clientWidth - 2 - width - 3 * this._uiMargin) + 'px';
            this._legend.style.top = (this.map.canvas.offsetTop + this.map.canvas.clientHeight - 2 - height - 3 * this._uiMargin) + 'px';
        }
    }


    /**
     * Change the current layer in the UI.
     * @param {Layer | null} layer - The layer to change to or null to clear.
     */
    public changeActiveLayer(layer: Layer | null): void {
        if (!layer) { return; }

        // stores the active layer
        this.activeLayer = layer;
        console.log(`Active layer: ${this.activeLayer.layerInfo.id}`);

        // Turn off picking for all layers
        this.map.layerManager.vectorLayers.forEach(
            layer => {
                if (layer.layerInfo.id == this.activeLayer?.layerInfo.id) { return; }
                this.map.updateRenderInfoProperty(layer.layerInfo.id, 'isPick', false);
                this.map.updateRenderInfoProperty(layer.layerInfo.id, 'isColorMap', false);
            }
        );

        // Set picking true
        this.map.updateRenderInfoProperty(this.activeLayer.layerInfo.id, 'isPick', true);

        // Show thematic based on the interface status
        if (!this._subMenu) { return; }
        let check = this._subMenu.querySelector('#showThematicCheckbox') as HTMLInputElement;
        if (check) {
            this.map.updateRenderInfoProperty(this.activeLayer.layerInfo.id, 'isColorMap', check.checked);
        }

        // Updates the current legend
        this.updateLegend();
    }

    /**
     * Build the UI elements for the map.
     */
    public buildUi(): void {
        if (!this._menuIcon) {
            this._menuIcon = document.createElement('div');
            this._menuIcon.id = 'autkMapUi';
            this._menuIcon.style.width = '30px !important';
            this._menuIcon.style.height = '30px !important';
            this._menuIcon.style.position = 'absolute';
            this._menuIcon.style.top = (this.map.canvas.offsetTop + this._uiMargin) + 'px';
            this._menuIcon.style.left = (this.map.canvas.offsetLeft + this._uiMargin) + 'px';
            this._menuIcon.style.zIndex = '10';

            const icon = document.createElement('a');
            icon.id = 'menuIcon';
            icon.style.maxWidth = '30px';
            icon.style.maxHeight = '30px';
            icon.style.display = 'block';
            icon.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
            icon.style.zIndex = '11';
            icon.style.backgroundColor = '#fff';
            icon.style.border = '1px solid #ccc';
            icon.style.borderRadius = '4px';

            icon.href = '#';
            icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
                <rect x="4" y="5"  rx="4" ry="4" width="20" height="3" fill="#aaa" stroke="none"></rect>
                <rect x="4" y="13"  rx="4" ry="4" width="20" height="3" fill="#aaa" stroke="none"></rect>
                <rect x="4" y="21" rx="4" ry="4" width="20" height="3" fill="#aaa" stroke="none"></rect>
            </svg>`

            this._menuIcon.appendChild(icon);
            this.map.canvas.parentElement?.appendChild(this._menuIcon);

            icon.addEventListener('click', () => {
                this.buildSubMenu();
                this.buildVisibleLayersDropdown();
                this.buildActiveLayerDropdown();
                this.buildLegendCheckbox();
                this.buildLegend();

                if (this._subMenu) {
                    this._subMenu.style.visibility = this._subMenu.style.visibility === 'visible' ? 'hidden' : 'visible';
                }
            });
        }
    }

    /**
     * Build the submenu for layer options.
     */
    protected buildSubMenu(): void {
        if (!this._subMenu) {
            this._subMenu = document.createElement('div');
            this._subMenu.id = 'autkMapSubMenu';
            this._subMenu.style.position = 'absolute';
            this._subMenu.style.top = (this.map.canvas.offsetTop + 30 + 2 * this._uiMargin) + 'px';
            this._subMenu.style.left = (this.map.canvas.offsetLeft + this._uiMargin) + 'px';
            this._subMenu.style.width = '300px';
            this._subMenu.style.display = 'block';
            this._subMenu.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
            this._subMenu.style.zIndex = '11';
            this._subMenu.style.backgroundColor = '#fff';
            this._subMenu.style.border = '1px solid #ccc';
            this._subMenu.style.borderRadius = '8px';
            this._subMenu.style.padding = '10px';
            this._subMenu.style.visibility = 'hidden';

            this.map.canvas.parentElement?.appendChild(this._subMenu);
        }
    }

    /**
     * Build the active layers dropdown.
     */
    protected buildVisibleLayersDropdown(): void {
        if (!this._subMenu) return;

        let title = this._subMenu.querySelector('#visibleLayersTitle') as HTMLHeadingElement;
        if (!title) {
            title = document.createElement('h3');
            title.id = 'visibleLayersTitle';
            title.textContent = 'Visible Layers';
            title.style.margin = '0 0 10px 0';
            title.style.fontSize = '16px';
            title.style.color = '#333';

            this._subMenu.appendChild(title);
        }

        let separator = this._subMenu.querySelector('#visibleLayersSeparator') as HTMLHRElement;
        if (!separator) {
            separator = document.createElement('hr');
            separator.id = 'visibleLayersSeparator';
            separator.style.margin = '10px 0';

            this._subMenu.appendChild(separator);
        }

        // Create dropdown container
        let dropdownContainer = this._subMenu.querySelector('#visibleLayerDropdownContainer') as HTMLDivElement;
        if (!dropdownContainer) {
            dropdownContainer = document.createElement('div');
            dropdownContainer.id = 'visibleLayerDropdownContainer';
            dropdownContainer.style.position = 'relative';
            dropdownContainer.style.marginBottom = '10px';

            this._subMenu.appendChild(dropdownContainer);
        }

        // Create dropdown button
        let dropdownButton = this._subMenu.querySelector('#visibleLayerDropdownButton') as HTMLButtonElement;
        if (!dropdownButton) {
            dropdownButton = document.createElement('button');
            dropdownButton.id = 'visibleLayerDropdownButton';
            dropdownButton.textContent = 'Select Layers';
            dropdownButton.style.width = '100%';
            dropdownButton.style.padding = '6px 12px';
            dropdownButton.style.border = '1px solid #ccc';
            dropdownButton.style.borderRadius = '4px';
            dropdownButton.style.background = '#f9f9f9';
            dropdownButton.style.cursor = 'pointer';
            dropdownButton.style.textAlign = 'left';

            dropdownContainer.appendChild(dropdownButton);
        }

        // Create dropdown list
        let dropdownList = this._subMenu.querySelector('#visibleLayerDropdownList') as HTMLDivElement;
        if (!dropdownList) {
            dropdownList = document.createElement('div');
            dropdownList.id = 'visibleLayerDropdownList';
            dropdownList.style.position = 'absolute';
            dropdownList.style.top = '110%';
            dropdownList.style.left = '0';
            dropdownList.style.width = '99%';
            dropdownList.style.background = '#f9f9f9';
            dropdownList.style.border = '1px solid #ccc';
            dropdownList.style.borderRadius = '4px';
            dropdownList.style.display = 'none';
            dropdownList.style.zIndex = '12';
            dropdownList.style.maxHeight = '200px';
            dropdownList.style.overflowY = 'auto';
            dropdownList.style.padding = '8px 0';

            dropdownContainer.appendChild(dropdownList);
        }
        // Clear previous dropdown list items
        dropdownList.innerHTML = '';

        // Populate dropdown with checkboxes
        const layers: Layer[] = this.map.layerManager.vectorLayers;
        const raster: Layer[] = this.map.layerManager.rasterLayers;

        (layers.concat(raster)).forEach(layer => {
            const initialSkip = layer?.layerRenderInfo.isSkip || false;

            const label = document.createElement('label');
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.padding = '4px 12px';
            label.style.cursor = 'pointer';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = !initialSkip;
            checkbox.value = layer.layerInfo.id;
            checkbox.style.marginRight = '8px';

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(layer.layerInfo.id));
            dropdownList.appendChild(label);

            // callback for checkbox change
            checkbox.addEventListener('change', (e) => {
                const checked = (e.target as HTMLInputElement).checked;
                layer.layerRenderInfo.isSkip = !checked;
                dropdownList.style.display = 'block';
            });
        });

        dropdownButton.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownList.style.display = dropdownList.style.display === 'block' ? 'none' : 'block';
        });

        // Hide dropdown when clicking outside
        document.addEventListener('click', () => {
            dropdownList.style.display = 'none';
        });
    }

    /**
     * Build the active layer dropdown.
     */
    protected buildActiveLayerDropdown(): void {
        if (!this._subMenu) return;

        let title = this._subMenu.querySelector('#activeLayersTitle') as HTMLHeadingElement;
        if (!title) {
            title = document.createElement('h3');
            title.id = 'activeLayersTitle';
            title.textContent = 'Active Layer';
            title.style.margin = '30px 0 10px 0';
            title.style.fontSize = '16px';
            title.style.color = '#333';

            this._subMenu.appendChild(title);
        }

        let separator = this._subMenu.querySelector('#activeLayersSeparator') as HTMLHRElement;
        if (!separator) {
            separator = document.createElement('hr');
            separator.id = 'activeLayersSeparator';
            separator.style.margin = '10px 0';

            this._subMenu.appendChild(separator);
        }

        // Create dropdown container
        let dropdownContainer = this._subMenu.querySelector('#activeLayersDropdownContainer') as HTMLDivElement;
        if (!dropdownContainer) {
            dropdownContainer = document.createElement('div');
            dropdownContainer.id = 'activeLayersDropdownContainer';
            dropdownContainer.style.position = 'relative';
            dropdownContainer.style.marginBottom = '10px';

            this._subMenu.appendChild(dropdownContainer);
        }

        // Create dropdown button
        let dropdownButton = this._subMenu.querySelector('#activeLayersDropdownButton') as HTMLButtonElement;
        if (!dropdownButton) {
            dropdownButton = document.createElement('button');
            dropdownButton.id = 'activeLayersDropdownButton';
            dropdownButton.textContent = 'Select Layers';
            dropdownButton.style.width = '100%';
            dropdownButton.style.padding = '6px 12px';
            dropdownButton.style.border = '1px solid #ccc';
            dropdownButton.style.borderRadius = '4px';
            dropdownButton.style.background = '#f9f9f9';
            dropdownButton.style.cursor = 'pointer';
            dropdownButton.style.textAlign = 'left';

            dropdownContainer.appendChild(dropdownButton);
        }

        // Create dropdown list
        let dropdownList = this._subMenu.querySelector('#activeLayersDropdownList') as HTMLDivElement;
        if (!dropdownList) {
            dropdownList = document.createElement('div');
            dropdownList.id = 'activeLayersDropdownList';
            dropdownList.style.position = 'absolute';
            dropdownList.style.top = '110%';
            dropdownList.style.left = '0';
            dropdownList.style.width = '99%';
            dropdownList.style.background = '#f9f9f9';
            dropdownList.style.border = '1px solid #ccc';
            dropdownList.style.borderRadius = '4px';
            dropdownList.style.display = 'none';
            dropdownList.style.zIndex = '12';
            dropdownList.style.maxHeight = '200px';
            dropdownList.style.overflowY = 'auto';
            dropdownList.style.padding = '8px 0';

            dropdownContainer.appendChild(dropdownList);
        }
        // Clear previous dropdown list items
        dropdownList.innerHTML = '';

        // Populate dropdown with checkboxes
        const layers: Layer[] = this.map.layerManager.vectorLayers;
        layers.forEach((layer, id) => {
            const isLast = id === layers.length - 1

            const label = document.createElement('label');
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.padding = '4px 12px';
            label.style.cursor = 'pointer';

            const radio = document.createElement('input');
            radio.className = 'active-layer-radio';
            radio.type = 'radio';
            radio.checked = isLast;
            radio.value = layer.layerInfo.id;
            radio.style.marginRight = '8px';

            if (isLast) {
                this.changeActiveLayer(this.map.layerManager.searchByLayerId(layer.layerInfo.id));
            }

            label.appendChild(radio);
            label.appendChild(document.createTextNode(layer.layerInfo.id));
            dropdownList.appendChild(label);

            // callback for radio change
            radio.addEventListener('change', (e) => {
                const radios = dropdownList.querySelectorAll('.active-layer-radio') as NodeListOf<HTMLInputElement>;
                radios.forEach(r => r.checked = false);

                (e.target as HTMLInputElement).checked = true;
                this.changeActiveLayer(this.map.layerManager.searchByLayerId(layer.layerInfo.id));
            });

        });

        dropdownButton.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownList.style.display = dropdownList.style.display === 'block' ? 'none' : 'block';
        });

        // Hide dropdown when clicking outside
        document.addEventListener('click', () => {
            dropdownList.style.display = 'none';
        });
    }

    /**
     * Build the legend checkbox for showing thematic data.
     */
    protected buildLegendCheckbox(): void {
        if (!this._subMenu) return;

        let label = this._subMenu.querySelector('#showThematicCheckboxLabel') as HTMLLabelElement;
        if (!label) {
            label = document.createElement('label');
            label.id = 'showThematicCheckboxLabel';
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.cursor = 'pointer';
        }

        let check = this._subMenu.querySelector('#showThematicCheckbox') as HTMLInputElement;
        if (!check) {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = 'showThematicCheckbox';
            checkbox.style.marginRight = '10px';
            checkbox.checked = this._activeLayer?.layerRenderInfo.isColorMap || false;

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode('Thematic Data'));
            this._subMenu.appendChild(label);

            // callback for checkbox change
            checkbox.addEventListener('change', (e) => {
                if (this._activeLayer) {
                    const checked = (e.target as HTMLInputElement).checked;
                    this.map.updateRenderInfoProperty(this._activeLayer.layerInfo.id, 'isColorMap', checked);
                    if (this._legend) { this._legend.style.visibility = checked ? 'visible' : 'hidden'; }
                }
            });
        }

        this.buildLegend();
    }

    /**
     * Build the submenu for layer options.
     */
    protected buildLegend(width = 250, height = 80): void {
        if (!this._legend) {
            this._legend = document.createElement('div');
            this._legend.id = 'autkMapLegend';
            this._legend.style.position = 'absolute';
            this._legend.style.width = width + 'px';
            this._legend.style.height = height + 'px';
            this._legend.style.display = 'block';
            this._legend.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
            this._legend.style.zIndex = '11';
            this._legend.style.backgroundColor = '#fff';
            this._legend.style.border = '1px solid #ccc';
            this._legend.style.borderRadius = '8px';
            this._legend.style.visibility = 'hidden';

            // Position bottom-right relative to the canvas
            this._legend.style.left = (this.map.canvas.offsetLeft + this.map.canvas.clientWidth - 2 - width - this._uiMargin) + 'px';
            this._legend.style.top = (this.map.canvas.offsetTop + this.map.canvas.clientHeight - 2 - height - this._uiMargin) + 'px';

            this.map.canvas.parentElement?.appendChild(this._legend);
        } 

        const checkbox = document.querySelector('#showThematicCheckbox') as HTMLInputElement;
        if (checkbox) {
            this._legend.style.visibility = checkbox.checked ? 'visible' : 'hidden';
        }
        this.updateLegend(width, height);
    }

    /**
     * Updates the legend display.
     * @param width The width of the legend
     * @param height The height of the legend
     */
    protected updateLegend(width = 250, height = 80): void {
        if (!this._legend || !this._activeLayer) return;

        // Clear previous legend content
        this._legend.innerHTML = '';

        const title = document.createElement('h4');
        title.textContent = this._activeLayer.layerInfo.id;
        title.style.margin = `${this._uiMargin}px`;
        title.style.fontSize = '14px';
        title.style.color = '#333';
        this._legend.appendChild(title);

        // Inner drawing area (leave room for title and padding)
        const padding = this._uiMargin;
        const titleHeight = 40;
        const innerWidth = width - 4 * padding;
        const innerHeight = height - titleHeight;

        // Create color map
        const interpolator = this._activeLayer.layerRenderInfo.colorMapInterpolator;
        const labels = this._activeLayer.layerRenderInfo.colorMapLabels;

        const res = interpolator === ColorMapInterpolator.OBSERVABLE10 ? 10 : 100;
        const slc = interpolator === ColorMapInterpolator.OBSERVABLE10 ? (labels.length < 10 ? labels.length : 10) : 100;

        const colorMap = ColorMap.getColorArray(interpolator, res).slice(0, slc);

        const svg = d3.select(this._legend)
            .append("svg")
            .attr("width", width)
            .attr("height", innerHeight);

        const rectWidth = innerWidth / colorMap.length;
        const rectHeight = innerHeight * 0.3;

        const g = svg.append("g")
            .attr("transform", `translate(${2 * padding}, 0)`);

        g.selectAll("rect")
            .data(colorMap)
            .join("rect")
            .attr("x", (_d, id) => id * rectWidth)
            .attr("y", 0)
            .attr("width", rectWidth)
            .attr("height", rectHeight)
            .style("fill", (d) => `rgb(${d.r},${d.g},${d.b})`)
            .style("stroke", (d) => `rgb(${d.r},${d.g},${d.b})`)
            .style("stroke-width", "1px");

        const textData = labels.map((d, i) => {
            if (interpolator === ColorMapInterpolator.OBSERVABLE10) {
                return { label: d, pos: i * rectWidth + (rectWidth / 2) };
            } else {
                return { label: d, pos: i * (innerWidth / (labels.length - 1)) };
            }
        });

        g.selectAll("text")
            .data(textData)
            .join("text")
            .text((d) => `${d.label.substring(0, 3)}`)
            .attr("x", (d) => d.pos)
            .attr("y", rectHeight + 12)
            .style("font-size", "12px")
            .style("fill", "#333")
            .style("text-anchor", "middle");
    }
}