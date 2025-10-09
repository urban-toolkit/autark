import { Layer } from './layer.js';
import { AutkMap } from './main.js';

/**
 * Map UI class for managing the user interface elements of the map.
 */
export class AutkMapUi {
    /**
     * Reference to the AutkMap instance.
     * @type {AutkMap}
     */
    protected _map: AutkMap

    /**
     * Currently selected layer in the UI.
     * @type {Layer | null}
     */
    protected _activeLayer: Layer | null;

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
        this.map.layerManager.layers.forEach(
            layer => {
                if (layer.layerInfo.id == this.activeLayer?.id) { return; }
                this.map.updateRenderInfoProperty(layer.layerInfo.id, 'isPick', false);
            }
        );

        // Set picking true
        this.map.updateRenderInfoProperty(this.activeLayer.layerInfo.id, 'isPick', true);

        // Show thematic based on the interface status
        if( !this._subMenu ) { return; }
        let check = this._subMenu.querySelector('#showThematicCheckbox') as HTMLInputElement;
        if (check) {
            this.map.updateRenderInfoProperty(this.activeLayer.layerInfo.id, 'isColorMap', check.checked);
        }

        // Updates the current legend
        // this.buildLegend();
    }

    /**
     * Build the UI elements for the map.
     */
    public buildUi(): void {
        this.buildHamburgerMenu();
        // this.buildLegend();
    }

    /**
     * Update the UI elements based on the current state of the map.
     */
    public updateUi(): void {
        this.buildVisibleLayersDropdown();
        this.buildEnablePickingDropdown();
        this.buildLegendCheckbox();
    }

    /**
     * Build the hamburger menu for layer options.
     */
    protected buildHamburgerMenu(): void {
        const css = '#menuIcon svg{ stroke: #aaa } #menuIcon svg:hover{ stroke: #555 }';
        const styleNode = document.createElement('style');
        styleNode.appendChild(document.createTextNode(css));

        const uiDiv = document.createElement('div');
        uiDiv.id = 'autkMapUi';
        uiDiv.style.width = '24px';
        uiDiv.style.height = '24px';
        uiDiv.style.position = 'absolute';
        uiDiv.style.top = (this.map.canvas.offsetTop + 5) + 'px';
        uiDiv.style.left = (this.map.canvas.offsetLeft + 5) + 'px';
        uiDiv.style.zIndex = '1000';

        const icon = document.createElement('a');
        icon.id = 'menuIcon';
        icon.style.width = '24px';
        icon.style.height = '24px';
        icon.style.padding = '2px';
        icon.style.display = 'block';
        icon.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
        icon.style.zIndex = '1001';
        icon.style.backgroundColor = '#fff';
        icon.style.border = '1px solid #ccc';
        icon.style.borderRadius = '4px';

        icon.href = '#';
        icon.innerHTML = `<svg  xmlns="http://www.w3.org/2000/svg"  width="24"  height="24"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-menu-2"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 6l16 0" /><path d="M4 12l16 0" /><path d="M4 18l16 0" /></svg>`

        icon.addEventListener('click', () => {
            this.buildSubMenu();
        });

        uiDiv.appendChild(styleNode);
        uiDiv.appendChild(icon);

        this.map.canvas.parentElement?.appendChild(uiDiv);
    }

    /**
     * Build the submenu for layer options.
     */
    protected buildSubMenu(): void {
        if (!this._subMenu) {
            this._subMenu = document.createElement('div');
            this._subMenu.id = 'autkMapSubMenu';
            this._subMenu.style.position = 'absolute';
            this._subMenu.style.top = (this.map.canvas.offsetTop + 40) + 'px';
            this._subMenu.style.left = (this.map.canvas.offsetLeft + 5) + 'px';
            this._subMenu.style.width = '300px';
            this._subMenu.style.display = 'block';
            this._subMenu.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
            this._subMenu.style.zIndex = '1001';
            this._subMenu.style.backgroundColor = '#fff';
            this._subMenu.style.border = '1px solid #ccc';
            this._subMenu.style.borderRadius = '8px';
            this._subMenu.style.padding = '10px';
            this._subMenu.style.visibility = 'hidden';

            this.map.canvas.parentElement?.appendChild(this._subMenu);
        }
        this._subMenu.style.visibility = this._subMenu.style.visibility === 'visible' ? 'hidden' : 'visible';
        this.updateUi();
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
            dropdownList.style.zIndex = '1002';
            dropdownList.style.maxHeight = '200px';
            dropdownList.style.overflowY = 'auto';
            dropdownList.style.padding = '8px 0';

            dropdownContainer.appendChild(dropdownList);
        }
        // Clear previous dropdown list items
        dropdownList.innerHTML = '';

        // Populate dropdown with checkboxes
        const layers = this.map.layerManager.layers;

        layers.forEach(layer => {
            const initialSkip = layer?.layerRenderInfo.isSkip || false;

            const label = document.createElement('label');
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.padding = '4px 12px';
            label.style.cursor = 'pointer';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = !initialSkip;
            checkbox.value = layer.id;
            checkbox.style.marginRight = '8px';

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(layer.id));
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
     * Build the active layers dropdown.
     */
    protected buildEnablePickingDropdown(): void {
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
            dropdownList.style.zIndex = '1002';
            dropdownList.style.maxHeight = '200px';
            dropdownList.style.overflowY = 'auto';
            dropdownList.style.padding = '8px 0';

            dropdownContainer.appendChild(dropdownList);
        }
        // Clear previous dropdown list items
        dropdownList.innerHTML = '';

        // Populate dropdown with checkboxes
        const layers = this.map.layerManager.layers;
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
            radio.value = layer.id;
            radio.style.marginRight = '8px';

            if (isLast) {
                this.changeActiveLayer(this.map.layerManager.searchByLayerId(layer.id));
            }

            label.appendChild(radio);
            label.appendChild(document.createTextNode(layer.id));
            dropdownList.appendChild(label);

            // callback for radio change
            radio.addEventListener('change', (e) => {
                const radios = dropdownList.querySelectorAll('.active-layer-radio') as NodeListOf<HTMLInputElement>;
                radios.forEach(r => r.checked = false);

                (e.target as HTMLInputElement).checked = true;
                this.changeActiveLayer(this.map.layerManager.searchByLayerId(layer.id));
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
            label.style.margin = '0 0 10px 0';
            label.style.cursor = 'pointer';
        }

        let check = this._subMenu.querySelector('#showThematicCheckbox') as HTMLInputElement;
        if (!check) {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = 'showThematicCheckbox';
            checkbox.checked = this._activeLayer?.layerRenderInfo.isColorMap || false;

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(' Show Thematic Data'));
            this._subMenu.appendChild(label);

            // callback for checkbox change
            checkbox.addEventListener('change', (e) => {
                if (this._activeLayer) {
                    const checked = (e.target as HTMLInputElement).checked;
                    this.map.updateRenderInfoProperty(this._activeLayer.layerInfo.id, 'isColorMap', checked);
                }
            });
        }
    }
}