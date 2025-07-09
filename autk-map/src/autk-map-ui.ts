import { Layer } from './layer.js';
import { AutkMap } from './autk-map.js';

export class AutkMapUi {
    static _map: AutkMap
    static _currentLayer: Layer | null;

    static get map(): AutkMap {
        return AutkMapUi._map;
    }

    static set map(map: AutkMap) {
        AutkMapUi._map = map;
    }

    static get currentLayer(): Layer | null {
        return AutkMapUi._currentLayer;
    }

    static set currentLayer(layer: Layer | null) {
        AutkMapUi._currentLayer = layer;
    }

    static changeLayer(layer: Layer | null): void {
        if (!layer) {
            console.warn('No layer provided to changeLayer');
            return;
        }

        AutkMapUi.currentLayer = layer;
        console.log(`Current layer: ${AutkMapUi.currentLayer.layerInfo.id}`);

        // Turn off picking for all layers
        AutkMapUi.map.layerManager.layers.forEach(layer => {
            if (layer.layerInfo.id == AutkMapUi.currentLayer?.id)
                return;
            AutkMapUi.map.updateRenderInfoPick(layer.layerInfo.id, false);
            layer.makeLayerRenderInfoDirty();
        });

        // Setting pick to true
        AutkMapUi.map.updateRenderInfoPick(AutkMapUi.currentLayer.layerInfo.id, true);
        AutkMapUi.currentLayer.makeLayerRenderInfoDirty();
    }

    static buildUi(map: AutkMap): void {
        AutkMapUi.map = map;

        const css = '#menuIcon svg{ stroke: #aaa } #menuIcon svg:hover{ stroke: #555 }';
        const styleNode = document.createElement('style');

        if (styleNode.style) {
            styleNode.style.cssText = css;
        }
        styleNode.appendChild(document.createTextNode(css));

        const uiDiv = document.createElement('div');
        uiDiv.id = 'autkMapUi';
        uiDiv.style.width = '24px';
        uiDiv.style.height = '24px';
        uiDiv.style.position = 'absolute';
        uiDiv.style.top = (AutkMapUi.map.canvas.offsetTop + 5) + 'px';
        uiDiv.style.left = (AutkMapUi.map.canvas.offsetLeft + 5) + 'px';
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
            AutkMapUi.buildSubMenu();
        });

        uiDiv.appendChild(styleNode);
        uiDiv.appendChild(icon);

        AutkMapUi.map.canvas.parentElement?.appendChild(uiDiv);
    }

    static updateUi(): void {
        if (!AutkMapUi.currentLayer) {
            AutkMapUi.changeLayer(AutkMapUi.map.layerManager.layers[0] || null);
            return;
        }

        this.buildActiveLayersDropdown();
        this.buildEnablePickingDropdown();
    }

    static buildSubMenu(): void {
        let subMenu = document.getElementById('autkMapSubMenu');

        if (!subMenu) {
            subMenu = document.createElement('div');
            subMenu.id = 'autkMapSubMenu';
            subMenu.style.position = 'absolute';
            subMenu.style.top = (AutkMapUi.map.canvas.offsetTop + 40) + 'px';
            subMenu.style.left = (AutkMapUi.map.canvas.offsetLeft + 5) + 'px';
            subMenu.style.width = '300px';
            subMenu.style.display = 'block';
            subMenu.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
            subMenu.style.zIndex = '1001';
            subMenu.style.backgroundColor = '#fff';
            subMenu.style.border = '1px solid #ccc';
            subMenu.style.borderRadius = '8px';
            subMenu.style.padding = '10px';
            subMenu.style.visibility = 'hidden';

            AutkMapUi.map.canvas.parentElement?.appendChild(subMenu);

            AutkMapUi.buildActiveLayersDropdown();
            AutkMapUi.buildEnablePickingDropdown();
        }

        if (subMenu.style.visibility === 'visible') {
            subMenu.style.visibility = 'hidden';
        } else {
            subMenu.style.visibility = 'visible';
        }
    }

    static buildActiveLayersDropdown(): void {
        const subMenu = document.getElementById('autkMapSubMenu');

        if (!subMenu) return;

        let title = document.getElementById('autkMapActiveLayersTitle');
        if (!title) {
            title = document.createElement('h3');
            title.id = 'autkMapActiveLayersTitle';
            title.textContent = 'Active Layers';
            title.style.margin = '0 0 10px 0';
            title.style.fontSize = '16px';
            title.style.color = '#333';

            subMenu.appendChild(title);
        }

        let separator = document.getElementById('activeLayersSeparator');
        if (!separator) {
            separator = document.createElement('hr');
            separator.id = 'activeLayersSeparator';
            separator.style.margin = '10px 0';

            subMenu.appendChild(separator);
        }

        // Create dropdown container
        let dropdownContainer = document.getElementById('autkMapLayerDropdownContainer');
        if (!dropdownContainer) {
            dropdownContainer = document.createElement('div');
            dropdownContainer.id = 'autkMapLayerDropdownContainer';
            dropdownContainer.style.position = 'relative';
            dropdownContainer.style.marginBottom = '10px';

            subMenu.appendChild(dropdownContainer);
        }

        // Create dropdown button
        let dropdownButton = document.getElementById('autkMapLayerDropdownButton');
        if (!dropdownButton) {
            dropdownButton = document.createElement('button');
            dropdownButton.id = 'autkMapLayerDropdownButton';
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
        let dropdownList = document.getElementById('autkMapLayerDropdownList');
        if (!dropdownList) {
            dropdownList = document.createElement('div');
            dropdownList.id = 'autkMapLayerDropdownList';
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
        const layers = AutkMapUi.map.layerManager.layers;

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

            checkbox.addEventListener('change', (e) => {
                const checked = (e.target as HTMLInputElement).checked;
                layer.layerRenderInfo.isSkip = !checked;
                dropdownList.style.display = 'block';
            });

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(layer.id));
            dropdownList.appendChild(label);
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

    static buildEnablePickingDropdown(): void {
        const subMenu = document.getElementById('autkMapSubMenu');

        if (!subMenu) return;

        let title = document.getElementById('autkMapEnablePickingTitle');
        if (!title) {
            title = document.createElement('h3');
            title.id = 'autkMapEnablePickingTitle';
            title.textContent = 'Picking Layer';
            title.style.margin = '30px 0 10px 0';
            title.style.fontSize = '16px';
            title.style.color = '#333';

            subMenu.appendChild(title);
        }

        let separator = document.getElementById('enablePickingSeparator');
        if (!separator) {
            separator = document.createElement('hr');
            separator.id = 'enablePickingSeparator';
            separator.style.margin = '10px 0';

            subMenu.appendChild(separator);
        }

        // Create dropdown container
        let dropdownContainer = document.getElementById('autkMapEnablePickingDropdownContainer');
        if (!dropdownContainer) {
            dropdownContainer = document.createElement('div');
            dropdownContainer.id = 'autkMapEnablePickingDropdownContainer';
            dropdownContainer.style.position = 'relative';
            dropdownContainer.style.marginBottom = '10px';

            subMenu.appendChild(dropdownContainer);
        }

        // Create a select element if it doesn't exist yet
        let select = dropdownContainer.querySelector('select') as HTMLSelectElement;
        if (!select) {
            select = document.createElement('select');
            select.style.width = '100%';
            select.style.padding = '6px 12px';
            select.style.border = '1px solid #ccc';
            select.style.borderRadius = '4px';
            select.style.background = '#f9f9f9';
            select.style.cursor = 'pointer';
            select.style.textAlign = 'left';

            // Handle selection change
            select.addEventListener('change', (e) => {
                const selectedLayerId = (e.target as HTMLSelectElement).value;
                layers.forEach(l => {
                    AutkMapUi.map.updateRenderInfoPick(l.id, l.id === selectedLayerId)
                });
            });

            dropdownContainer.appendChild(select);
        }
        // Clear previous options
        select.innerHTML = '';

        const layers = AutkMapUi.map.layerManager.layers;
        layers.forEach(layer => {
            const layerId = layer.id;
            const isPickEnabled = layer?.layerRenderInfo.isPick || false;

            const option = document.createElement('option');
            option.value = layerId;
            option.textContent = layerId;
            option.selected = isPickEnabled;

            select.appendChild(option);

            AutkMapUi.changeLayer(AutkMapUi.map.layerManager.searchByLayerId(layerId));
        });
    }
}