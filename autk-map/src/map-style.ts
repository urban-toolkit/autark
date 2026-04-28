/**
 * @module MapStyle
 * Shared color-style registry and utilities for semantic map layers.
 *
 * This module defines the `MapStyle` class and related types used to manage
 * built-in and runtime-provided map styles. It centralizes validation of style
 * payloads, tracks the active semantic color set, and exposes helpers for
 * resolving style colors into the RGB values consumed by the renderer.
 */

import { ColorHEX, ColorRGB, ColorMap, LAYER_TYPE_VALUES } from './types-core';
import type { LayerType } from './types-core';

import defaultStyle from './styles/default.json';
import light from './styles/light.json';
import google from './styles/google.json';
import apple from './styles/apple.json';
import osm from './styles/osm.json';

/** Supported built-in style preset identifiers. */
export type MapStylePresetId = 'default' | 'light' | 'google' | 'apple' | 'osm';

/** Ordered preset ids used for keyboard style cycling. */
const PRESET_IDS: readonly MapStylePresetId[] = ['default', 'light', 'google', 'apple', 'osm'];
/** Required keys for a valid map style object — derived from `LayerType` minus `raster`. */
const MAP_STYLE_KEYS: Array<keyof MapStyleShape> = LAYER_TYPE_VALUES.filter(
  (l): l is Exclude<LayerType, 'raster'> => l !== 'raster',
) as Array<keyof MapStyleShape>;
/** Accepts #RGB, #RRGGBB and #RRGGBBAA color literals. */
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * Semantic color slots required by a map style.
 *
 * Each key maps a renderer-facing semantic layer or feature family to a hex
 * color literal. Runtime custom styles must provide every field defined by this
 * interface.
 */
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

/**
 * Static registry and accessor for map style presets and shared UI colors.
 *
 * `MapStyle` stores the active semantic style used by the map renderer, along
 * with a small set of related shared colors such as highlight and invalid-value
 * fallbacks. It also validates built-in and custom style definitions before
 * they become active, ensuring all required semantic keys are present and use
 * supported hex color formats.
 *
 * @example
 * MapStyle.setPredefinedStyle('light');
 *
 * const roads = MapStyle.getColor('roads');
 *
 * MapStyle.setCustomStyle({
 *   background: '#ffffff',
 *   surface: '#f2f2f2',
 *   parks: '#cfe8c8',
 *   water: '#b9dcff',
 *   roads: '#d0d0d0',
 *   buildings: '#c8c8c8',
 *   points: '#555555',
 *   polylines: '#777777',
 *   polygons: '#999999',
 * });
 */
export class MapStyle {
    /** Built-in style presets available by id. */
    protected static _presets: Record<MapStylePresetId, MapStyleShape> = {
        default: MapStyle._normalizeStyle(defaultStyle as MapStyleShape, 'default'),
        light: MapStyle._normalizeStyle(light as MapStyleShape, 'light'),
        google: MapStyle._normalizeStyle(google as MapStyleShape, 'google'),
        apple: MapStyle._normalizeStyle(apple as MapStyleShape, 'apple'),
        osm: MapStyle._normalizeStyle(osm as MapStyleShape, 'osm'),
    };

    /** Default style assigned during initial map startup. */
    protected static _default: MapStyleShape = defaultStyle as MapStyleShape;

    /** Color used for invalid thematic values. */
    protected static _invalidValue: ColorHEX = '#FFFFFF';
    /** Highlight color used for interactive selections. */
    protected static _highlight: ColorHEX = '#5dade2';

    /** Currently active semantic map style. */
    protected static _current: MapStyleShape = MapStyle._default;
    /** Identifier of the currently active style or `custom`. */
    protected static _currentStyle: string = 'default';

    /**
     * Returns the identifier of the currently active style.
     *
     * Built-in presets return their preset id. Styles applied through
     * `setCustomStyle()` report `custom`.
     *
     * @returns Active style identifier.
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
     *
     * Unknown keys fall back to the polygons color.
     *
     * @param type Semantic style key to resolve.
     * @returns RGB color for the requested key, or the active polygons color when the key is unknown.
     */
    static getColor(type: string): ColorRGB {
        const style = MapStyle._current;
        const hex = (Object.prototype.hasOwnProperty.call(style, type)
            ? style[type as keyof MapStyleShape]
            : undefined) ?? style.polygons;

        return ColorMap.hexToRgb(hex);
    }

    /**
     * Returns the color used for invalid thematic values.
     *
     * @returns RGB fallback color used when thematic values are marked invalid.
     */
    static getInvalidValueColor(): ColorRGB {
        return ColorMap.hexToRgb(MapStyle._invalidValue);
    }

    /**
     * Applies one of the built-in map style presets.
     *
     * Unknown ids fall back to `default`.
     *
     * @param style Preset identifier.
     * @returns Nothing. The active style and active style id are updated immediately.
     */
    static setPredefinedStyle(style: string): void {
        const presetId: MapStylePresetId = MapStyle._isPresetId(style) ? style : 'default';
        MapStyle._current = MapStyle._presets[presetId];
        MapStyle._currentStyle = presetId;
    }

    /**
     * Applies a runtime custom style after validation.
     *
     * The provided style must include every semantic key defined by
     * `MapStyleShape`, and each value must be a supported hex color literal.
     * Validation errors are thrown before the active style is replaced.
     *
     * @param style Style object with all required semantic color keys.
     * @returns Nothing. The validated style becomes the active style and the active style id becomes `custom`.
     */
    static setCustomStyle(style: MapStyleShape): void {
        MapStyle._current = MapStyle._normalizeStyle(style, 'custom');
        MapStyle._currentStyle = 'custom';
    }

    /**
     * Returns the current highlight color.
     *
     * @returns RGB highlight color used for interactive selections.
     */
    static getHighlightColor(): ColorRGB {
        return ColorMap.hexToRgb(MapStyle._highlight);
    }

    /**
     * Sets the highlight color.
     *
     * This method stores the provided hex color as-is and does not validate the
     * value.
     *
     * @param color New highlight color in hex format.
     * @returns Nothing. Subsequent highlight color lookups use the new value.
     */
    static setHighlightColor(color: ColorHEX): void {
        MapStyle._highlight = color;
    }

    /**
     * Sets the color used for invalid thematic values.
     *
     * This method stores the provided hex color as-is and does not validate the
     * value.
     *
     * @param color New fallback color for invalid thematic values.
     * @returns Nothing. Subsequent invalid-value color lookups use the new value.
     */
    static setInvalidValueColor(color: ColorHEX): void {
        MapStyle._invalidValue = color;
    }

    /**
     * Checks whether a string matches one of the built-in preset ids.
     *
     * @param style Candidate preset identifier.
     * @returns `true` when the value names a built-in preset.
     */
    private static _isPresetId(style: string): style is MapStylePresetId {
        return (PRESET_IDS as readonly string[]).includes(style);
    }

    /**
     * Normalizes and validates a style definition.
     *
     * Every required semantic key must be present and contain a non-empty hex
     * color string. Values are trimmed before validation and before being stored
     * in the returned object.
     *
     * Throws on invalid input so callers fail fast with actionable errors.
     *
     * @param style Style object to validate.
     * @param source Human-readable source label included in thrown error messages.
     * @returns Normalized style object containing trimmed hex color values for every required key.
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
