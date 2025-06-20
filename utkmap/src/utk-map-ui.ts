import { UtkMap } from './utk-map.js';

export class UtkMapUi {

    static buildUi(map: UtkMap): void {
        const css = '#menuIcon svg{ stroke: #aaa } #menuIcon svg:hover{ stroke: #555 }';
        const styleNode = document.createElement('style');

        if (styleNode.style) {
            styleNode.style.cssText = css;
        }
        styleNode.appendChild(document.createTextNode(css));

        const uiDiv = document.createElement('div');
        uiDiv.id = 'utkMapUi';
        uiDiv.style.width = '24px';
        uiDiv.style.height = '24px';
        uiDiv.style.position = 'absolute';
        uiDiv.style.top = (map.canvas.offsetTop + 5) + 'px';
        uiDiv.style.left = (map.canvas.offsetLeft + 5) + 'px';
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

        icon.addEventListener('click', (e) => {
            UtkMapUi.openSubMenu(map);
        });

        uiDiv.appendChild(styleNode);
        uiDiv.appendChild(icon);

        map.canvas.parentElement?.appendChild(uiDiv);
    }

    static openSubMenu(map: UtkMap): void {
        let subMenu = document.getElementById('utkMapSubMenu');

        if (!subMenu) {
            subMenu = document.createElement('div');
            subMenu.id = 'utkMapSubMenu';
            subMenu.style.position = 'absolute';
            subMenu.style.top = (map.canvas.offsetTop + 40) + 'px';
            subMenu.style.left = (map.canvas.offsetLeft + 5) + 'px';
            subMenu.style.width = '300px';
            subMenu.style.height = '350px';
            subMenu.style.display = 'block';
            subMenu.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
            subMenu.style.zIndex = '1001';
            subMenu.style.backgroundColor = '#fff';
            subMenu.style.border = '1px solid #ccc';
            subMenu.style.borderRadius = '4px';
            subMenu.style.padding = '10px';
            subMenu.style.visibility = 'hidden';

            map.canvas.parentElement?.appendChild(subMenu);

            UtkMapUi.buildDropdownMenu(map);
        }

        if (subMenu.style.visibility === 'visible') {
            subMenu.style.visibility = 'hidden';
        } else {
            subMenu.style.visibility = 'visible';
            console.log(map.layerManager.layers.map(layer => layer.id));
        }

    }

    static buildDropdownMenu(map: UtkMap): void {
        const subMenu = document.getElementById('utkMapSubMenu');

        const title = document.createElement('h3');
        title.textContent = 'Loaded Layers';
        title.style.margin = '0 0 10px 0';
        title.style.fontSize = '16px';
        title.style.color = '#333';

        const separator = document.createElement('hr');
        separator.style.margin = '10px 0';

        const dropdown = document.createElement('select');
        dropdown.setAttribute('multiple', 'multiple');
        dropdown.id = 'utkMapLayerDropdown';
        dropdown.style.width = '100%';
        dropdown.style.height = '30px';
        dropdown.style.marginBottom = '10px';

        const layers = map.layerManager.layers;
        layers.forEach(layer => {
            const option = document.createElement('option');
            option.value = layer.id;
            option.textContent = layer.id;
            dropdown.appendChild(option);
        });

        dropdown.addEventListener('change', (e) => {
            const selectedLayerId = (e.target as HTMLSelectElement).value;
            const layer = map.layerManager.searchByLayerId(selectedLayerId);

            if (layer) {
                layer.layerRenderInfo.isSkip = !layer?.layerRenderInfo.isSkip || false;
                map.draw();
            }
        });

        if (subMenu) {
            subMenu.appendChild(title);
            subMenu.appendChild(separator);
            subMenu.appendChild(dropdown);
        }
    }

}