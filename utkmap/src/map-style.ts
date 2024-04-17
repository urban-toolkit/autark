import { ColorHEX, ColorRGB } from './constants';

import { ColorMap } from './colormap';
import { IMapStyle } from './interfaces';

// @ts-ignore 
import light from './styles/light.json';
// @ts-ignore
import dark from './styles/dark.json'; 

export class MapStyle {
    // default color map
    protected static _default: IMapStyle = {
        land: '#DFDFDF',
        roads: '#d9b504',
        parks: '#C3D0B2',
        water: '#BED2D7',
        sky: '#ffffff',
        surface: "#EFEFEF",
        buildings: '#DFDFDF'
    };

    // default color for unknown layers
    protected static _notFound: ColorHEX = "#FFFFFF";
    // default highlight color
    protected static _highlight: ColorHEX = "#FFDD00";

    // custom style
    protected static _current: IMapStyle = MapStyle._default;
    protected static _currentStyle: string = 'default';

    public static get currentStyle(): string {
        return MapStyle._currentStyle;
    }

    /**
     * Get the feature color
     * @param {string} type Feature type
     */
    public static getColor(type: keyof IMapStyle): ColorRGB {
        // uses the default style if available
        const style = MapStyle._current;
        const hex = style[type] || MapStyle._notFound; 

        return ColorMap.hexToRgb(hex);
    }

    /**
     * Set the feature color
     * @param {string} style new map style in id: #rrggbb format
     */
    public static setPredefinedStyle(style: string) {
        let styleObj = null;

        if (style === 'light') {
            styleObj = light;
            MapStyle._currentStyle = 'light';
        }
        else if (style === 'dark') {
            styleObj = dark;
            MapStyle._currentStyle = 'dark';
        } else {
            styleObj = MapStyle._default;
            MapStyle._currentStyle = 'default';
        }

        MapStyle._current = styleObj;
    }

    /**
     * Set the feature color
     * @param {string} style new map style json
     */
    public static setCustomStyle(style: IMapStyle) {
        MapStyle._current = style;
    }

    public static getHighlightColor(): ColorRGB {
        return ColorMap.hexToRgb(MapStyle._highlight);
    }
}