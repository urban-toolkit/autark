import { ColorHEX, ColorRGB } from './types';
import { ColorMap } from './colormap';

export class PlotStyle {
    // default color for unknown layers
    protected static _default: ColorHEX = '#bfbfbf';
    // default highlight color
    protected static _highlight: ColorHEX = '#5dade2';

    static get default(): ColorHEX {
        return PlotStyle._default;
    }

    static get highlight(): ColorHEX {
        return PlotStyle._highlight;
    }
    
    public static setHighlightColor(color: ColorHEX): void {
        PlotStyle._highlight = color;
    }

    public static getHighlightColor(): ColorRGB {
        return ColorMap.hexToRgb(PlotStyle._highlight);
    }

    public static setDefaultColor(color: ColorHEX): void {
        PlotStyle._default = color;
    }

    public static getDefaultColor(): ColorRGB {
        return ColorMap.hexToRgb(PlotStyle._default);
    }}
