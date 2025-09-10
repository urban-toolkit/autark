import { ColorHEX, ColorRGB } from './constants';

import { ColorMap } from './colormap';
import { IMapStyle } from './interfaces';

import light from './styles/light.json';
import dark from './styles/dark.json';

export class MapStyle {
    /**
     * Default map style
     */
    protected static _default: IMapStyle = {
        background: '#bed2d7',
        surface: '#EFEFEF',
        parks: '#C3D0B2',
        water: '#bed2d7',
        roads: '#d9b504',
        buildings: '#DFDFDF',
        boundaries: '#DFDFDF',
        lines: '#FAFAFA',
    };

    /**
     * Not found color
     */
    protected static _notFound: ColorHEX = '#FFFFFF';
    /**
     * Highlight color
     */
    protected static _highlight: ColorHEX = '#5dade2';

    /**
     * Current map style
     */
    protected static _current: IMapStyle = MapStyle._default;
    /**
     * Current map style id
     */
    protected static _currentStyle: string = 'default';

    /**
     * Get the current map style id
     * @return {string} The current map style id
     */
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
        let styleObj: IMapStyle = MapStyle._default;
        let styleSrt: string = 'default';

        if (style === 'light') {
            styleObj = <IMapStyle>light;
            styleSrt = 'light';
        } else if (style === 'dark') {
            styleObj = <IMapStyle>dark;
            styleSrt = 'dark';
        }

        MapStyle._current = styleObj;
        MapStyle._currentStyle = styleSrt;
    }

    /**
     * Set the feature color
     * @param {string} style new map style json
     */
    public static setCustomStyle(style: IMapStyle) {
        MapStyle._current = style;
    }

    /**
     * Get the highlight color
     * @returns {ColorRGB} The highlight color
     */
    public static getHighlightColor(): ColorRGB {
        return ColorMap.hexToRgb(MapStyle._highlight);
    }
}
