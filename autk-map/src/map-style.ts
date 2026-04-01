import { ColorHEX, ColorRGB } from './constants';

import { ColorMap } from 'autk-core';

import light from './styles/light.json';
import dark from './styles/dark.json';

/** Shape of a map style object. */
export interface MapStyleShape {
    background: ColorHEX;
    surface: ColorHEX;
    parks: ColorHEX;
    water: ColorHEX;
    roads: ColorHEX;
    buildings: ColorHEX;
    points: ColorHEX;
    polylines: ColorHEX;
    polygons: ColorHEX;
}

export class MapStyle {
    /**
     * Default map style
     */
    protected static _default: MapStyleShape = {
        background: '#bed2d7',
        surface: '#EFEFEF',
        parks: '#C3D0B2',
        water: '#bed2d7',
        roads: '#d9b504',
        buildings: '#DFDFDF',
        points: '#7f7f7fff',
        polylines: '#DFDFDF',
        polygons: '#DFDFDF',
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
    protected static _current: MapStyleShape = MapStyle._default;
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
    public static getColor(type: keyof MapStyleShape): ColorRGB {
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
        let styleObj: MapStyleShape = MapStyle._default;
        let styleSrt: string = 'default';

        if (style === 'light') {
            styleObj = <MapStyleShape>light;
            styleSrt = 'light';
        } else if (style === 'dark') {
            styleObj = <MapStyleShape>dark;
            styleSrt = 'dark';
        }

        MapStyle._current = styleObj;
        MapStyle._currentStyle = styleSrt;
    }

    /**
     * Set the feature color
     * @param {string} style new map style json
     */
    public static setCustomStyle(style: MapStyleShape) {
        MapStyle._current = style;
    }

    /**
     * Get the highlight color
     * @returns {ColorRGB} The highlight color
     */
    public static getHighlightColor(): ColorRGB {
        return ColorMap.hexToRgb(MapStyle._highlight);
    }

    /**
     * Set the highlight color
     * @param {ColorHEX} color The new highlight color in hex format
     */
    public static setHighlightColor(color: ColorHEX): void {
        MapStyle._highlight = color;
    }
}
