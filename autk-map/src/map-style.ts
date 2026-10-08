/**
 * @module MapStyle
 * Per-map color-style state and utilities for semantic map layers.
 *
 * This module defines the `MapStyle` class and related types used to manage
 * built-in and runtime-provided map styles. Each `AutkMap` owns its own
 * `MapStyle` instance so multiple maps can use different visual treatments.
 */

import { ColorHEX, ColorRGB, ColorMap, LAYER_TYPE_VALUES } from '@urban-toolkit/autk-core';
import type { LayerType } from '@urban-toolkit/autk-core';

import defaultStyle from './styles/default.json';
import light from './styles/light.json';
import google from './styles/google.json';
import apple from './styles/apple.json';
import osm from './styles/osm.json';

/** Supported built-in style preset identifiers. */
export type MapStylePresetId = 'default' | 'light' | 'google' | 'apple' | 'osm';

/** Ordered preset ids used for keyboard style cycling. */
const PRESET_IDS: readonly MapStylePresetId[] = ['apple', 'default', 'light', 'google', 'osm'];
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
 * Instance-owned map style state and semantic color resolver.
 *
 * `MapStyle` stores the active semantic style for one map, along with related
 * colors such as highlight and invalid-value fallbacks. Built-in and custom
 * styles are validated before they become active.
 *
 * @example
 * const style = new MapStyle('apple');
 * style.setPredefinedStyle('light');
 * const roads = style.getColor('roads');
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

    /** Default style assigned to new maps. */
    protected static _defaultStyleId: MapStylePresetId = 'apple';

    /** Color used for invalid thematic values. */
    protected _invalidValue: ColorHEX = '#FFFFFF';
    /** Highlight color used for interactive selections. */
    protected _highlight: ColorHEX = '#5dade2';
    /** Currently active semantic map style. */
    protected _current: MapStyleShape;
    /** Identifier of the currently active style or `custom`. */
    protected _currentStyle: string;
    /** Callback run after the active style or one of its colors changes. */
    private _onChange: (() => void) | null = null;

    /**
     * Creates a style state initialized from a built-in preset.
     *
     * @param style Initial built-in style id. Unknown ids fall back to `apple`.
     * @throws Never throws.
     * @example
     * const style = new MapStyle('apple');
     */
    constructor(style: string = MapStyle._defaultStyleId) {
        const presetId: MapStylePresetId = MapStyle._isPresetId(style) ? style : MapStyle._defaultStyleId;
        this._current = MapStyle._presets[presetId];
        this._currentStyle = presetId;
    }

    /**
     * Returns the identifier of the currently active style.
     *
     * Built-in presets return their preset id. Styles applied through
     * `setCustomStyle()` report `custom`.
     *
     * @returns Active style identifier.
     */
    get currentStyle(): string {
        return this._currentStyle;
    }

    /** Returns the list of built-in preset ids. */
    get availableStyles(): MapStylePresetId[] {
        return MapStyle.availableStyles;
    }

    /** Returns the list of built-in preset ids. */
    static get availableStyles(): MapStylePresetId[] {
        return [...PRESET_IDS];
    }

    /**
     * Returns the feature color for a style key, falling back to polygons color.
     *
     * @param type Semantic style key to resolve.
     * @returns RGB color for the requested key.
     * @throws Never throws.
     * @example
     * const roadsColor = style.getColor('roads');
     */
    getColor(type: string): ColorRGB {
        const hex = (Object.prototype.hasOwnProperty.call(this._current, type)
            ? this._current[type as keyof MapStyleShape]
            : undefined) ?? this._current.polygons;

        return ColorMap.hexToRgb(hex);
    }

    /**
     * Returns the color used for invalid thematic values.
     *
     * @returns RGB fallback color.
     * @throws Never throws.
     */
    getInvalidValueColor(): ColorRGB {
        return ColorMap.hexToRgb(this._invalidValue);
    }

    /**
     * Registers the callback run after the style changes.
     *
     * `AutkMap` uses it to schedule a frame in on-demand mode. Pass `null` to
     * remove the callback.
     *
     * @param listener Callback run after each style change, or `null`.
     * @returns Nothing.
     * @throws Never throws.
     */
    setChangeListener(listener: (() => void) | null): void {
        this._onChange = listener;
    }

    /**
     * Applies one of the built-in map style presets.
     *
     * @param style Preset identifier. Unknown ids fall back to `apple`.
     * @returns Nothing.
     * @throws Never throws.
     * @example
     * style.setPredefinedStyle('light');
     */
    setPredefinedStyle(style: string): void {
        const presetId: MapStylePresetId = MapStyle._isPresetId(style) ? style : MapStyle._defaultStyleId;
        this._current = MapStyle._presets[presetId];
        this._currentStyle = presetId;
        this._onChange?.();
    }

    /**
     * Applies a runtime custom style after validation.
     *
     * @param style Style object with all required semantic color keys.
     * @returns Nothing. The style id becomes `custom`.
     * @throws If the style is missing required keys or has invalid hex color values.
     * @example
     * style.setCustomStyle({ background: '#fff', surface: '#eee', parks: '#cfc', water: '#bdf', roads: '#ddd', buildings: '#ccc', points: '#555', polylines: '#777', polygons: '#999' });
     */
    setCustomStyle(style: MapStyleShape): void {
        this._current = MapStyle._normalizeStyle(style, 'custom');
        this._currentStyle = 'custom';
        this._onChange?.();
    }

    /**
     * Returns the current highlight color.
     *
     * @returns RGB highlight color.
     * @throws Never throws.
     */
    getHighlightColor(): ColorRGB {
        return ColorMap.hexToRgb(this._highlight);
    }

    /**
     * Sets the highlight color.
     *
     * @param color New highlight color in hex format.
     * @returns Nothing.
     * @throws Never throws.
     */
    setHighlightColor(color: ColorHEX): void {
        this._highlight = color;
        this._onChange?.();
    }

    /**
     * Sets the color used for invalid thematic values.
     *
     * @param color New fallback color for invalid thematic values.
     * @returns Nothing.
     * @throws Never throws.
     */
    setInvalidValueColor(color: ColorHEX): void {
        this._invalidValue = color;
        this._onChange?.();
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
