import { ColorHEX, ColorRGB, ColorMap } from './core-types';

import defaultStyle from './styles/default.json';
import light from './styles/light.json';
import google from './styles/google.json';
import apple from './styles/apple.json';
import osm from './styles/osm.json';

/** Supported built-in style preset identifiers. */
export type MapStylePresetId = 'default' | 'light' | 'google' | 'apple' | 'osm';

/** Ordered preset ids used for keyboard style cycling. */
const PRESET_IDS: readonly MapStylePresetId[] = ['default', 'light', 'google', 'apple', 'osm'];
/** Required keys for a valid map style object. */
const MAP_STYLE_KEYS: Array<keyof MapStyleShape> = [
    'background',
    'surface',
    'parks',
    'water',
    'roads',
    'buildings',
    'points',
    'polylines',
    'polygons',
];
/** Accepts #RGB, #RRGGBB and #RRGGBBAA color literals. */
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

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
    /** Built-in style presets available by id. */
    protected static _presets: Record<MapStylePresetId, MapStyleShape> = {
        default: MapStyle._normalizeStyle(defaultStyle as MapStyleShape, 'default'),
        light: MapStyle._normalizeStyle(light as MapStyleShape, 'light'),
        google: MapStyle._normalizeStyle(google as MapStyleShape, 'google'),
        apple: MapStyle._normalizeStyle(apple as MapStyleShape, 'apple'),
        osm: MapStyle._normalizeStyle(osm as MapStyleShape, 'osm'),
    };

    /**
     * Default map style
     */
    protected static _default: MapStyleShape = defaultStyle as MapStyleShape;

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
    static get currentStyle(): string {
        return MapStyle._currentStyle;
    }

    /** Returns the list of built-in preset ids. */
    static get availableStyles(): MapStylePresetId[] {
        return [...PRESET_IDS];
    }

    /**
     * Get the feature color for a style key.
     * Unknown keys fall back to `_notFound`.
     */
    static getColor(type: string): ColorRGB {
        const style = MapStyle._current;
        const hex = (Object.prototype.hasOwnProperty.call(style, type)
            ? style[type as keyof MapStyleShape]
            : undefined) ?? MapStyle._notFound;

        return ColorMap.hexToRgb(hex);
    }

    /**
     * Applies one of the built-in map style presets.
     * Unknown ids fall back to `default`.
     * @param style Preset identifier.
     */
    static setPredefinedStyle(style: string): void {
        const presetId: MapStylePresetId = MapStyle._isPresetId(style) ? style : 'default';
        MapStyle._current = MapStyle._presets[presetId];
        MapStyle._currentStyle = presetId;
    }

    /**
     * Applies a runtime custom style after validation.
     * @param style Style object with all required semantic color keys.
     */
    static setCustomStyle(style: MapStyleShape): void {
        MapStyle._current = MapStyle._normalizeStyle(style, 'custom');
        MapStyle._currentStyle = 'custom';
    }

    /**
     * Get the highlight color
     * @returns {ColorRGB} The highlight color
     */
    static getHighlightColor(): ColorRGB {
        return ColorMap.hexToRgb(MapStyle._highlight);
    }

    /**
     * Set the highlight color
     * @param {ColorHEX} color The new highlight color in hex format
     */
    static setHighlightColor(color: ColorHEX): void {
        MapStyle._highlight = color;
    }

    private static _isPresetId(style: string): style is MapStylePresetId {
        return (PRESET_IDS as readonly string[]).includes(style);
    }

    /**
     * Validates required keys and hex values.
     * Throws on invalid input so callers fail fast with actionable errors.
     */
    private static _normalizeStyle(style: MapStyleShape, source: string): MapStyleShape {
        const normalized: Partial<MapStyleShape> = {};

        for (const key of MAP_STYLE_KEYS) {
            const value = style[key];

            if (typeof value !== 'string' || value.trim().length === 0) {
                throw new Error(`MapStyle(${source}): missing required key "${key}".`);
            }

            const trimmed = value.trim();
            if (!HEX_COLOR_RE.test(trimmed)) {
                throw new Error(`MapStyle(${source}): key "${key}" must be a hex color (#RGB, #RRGGBB or #RRGGBBAA).`);
            }

            normalized[key] = trimmed as ColorHEX;
        }

        return normalized as MapStyleShape;
    }
}
