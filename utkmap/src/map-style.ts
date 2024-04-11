import { ColorHEX, ColorRGB } from './constants';

import { ColorMap } from './colormap';
import { IMapStyle } from './interfaces';

// @ts-ignore 
import light from './styles/light.json';
// @ts-ignore
import dark from './styles/dark.json'; 

export class MapStyle {
    // default color map
    protected static default: IMapStyle = {
        land: '#DFDFDF',
        roads: '#d9b504',
        parks: '#C3D0B2',
        water: '#BED2D7',
        sky: '#ffffff',
        surface: "#b8b8b8",
        buildings: '#DFDFDF'
    };

    // default color for unknown layers
    protected static notFound: ColorHEX = "#FFFFFF";
    // default highlight color
    protected static highlight: ColorHEX = "#FFDD00";

    // custom style
    protected static custom: IMapStyle = MapStyle.default;

    /**
     * Get the feature color
     * @param {string} type Feature type
     */
    public static getColor(type: keyof IMapStyle): ColorRGB {
        // uses the default style if available
        const style = MapStyle.custom || MapStyle.default;
        const hex = style[type] || MapStyle.notFound; 

        return ColorMap.hexToRgb(hex);
    }

    /**
     * Set the feature color
     * @param {any} style new map style in id: #rrggbb format
     */
    // @ts-ignore
    public static setPredefinedStyle(style: string) {
        let styleObj = MapStyle.default;

        console.log(light);

        if (style === 'light') {
            styleObj = light;
        }
        else if (style === 'dark') {
            styleObj = dark;
        }

        MapStyle.custom = styleObj;
    }

    public static getHighlightColor(): ColorRGB {
        return ColorMap.hexToRgb(MapStyle.highlight);
    }
}