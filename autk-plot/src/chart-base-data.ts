import type {
    Feature,
    GeoJsonProperties,
    Geometry,
} from 'geojson';

import type { AutkDatum } from './types-chart';

import type {
    ChartConfig,
    ChartMargins,
    ChartTransformConfig,
} from './api';

import {
    ColorMapInterpolator,
    ColorMapDomainStrategy,
    ColorMap,
    valueAtPath,
} from './types-core';
import type { ColorMapDomainSpec, ResolvedDomain } from './types-core';

import { run } from './transforms';
import type { ExecutedChartTransform } from './transforms';

/**
 * Normalized transform payload returned by `resolveTransformResult()`.
 *
 * The shared transform runners expose preset-specific row shapes. This type
 * collapses those results into the rendered schema consumed by chart classes.
 */
type ResolvedChartTransform = {
    /** Render rows stored on `_data` for the current draw cycle. */
    rows: AutkDatum[];
    /** Optional axis bindings exposed by the transformed row shape. */
    axisAttributes?: string[];
    /** Optional color binding exposed by the transformed row shape. */
    colorAttribute?: string;
};

/**
 * Base class for shared chart data lifecycle.
 *
 * Normalizes input rows, validates configured bindings, runs transforms, and
 * resolves the active rendered schema used by subclasses during drawing.
 */
export abstract class ChartBaseData {
    /** Host element where the chart is rendered. */
    protected _div!: HTMLElement;

    /** Original source features from the input collection, indexed by source feature id. */
    protected _sourceFeatures!: Feature<Geometry, GeoJsonProperties>[];
    /** Normalized render rows bound to marks. */
    protected _data!: AutkDatum[];

    /** Dot-path attributes used to read values from source rows. */
    private _sourceAxisAttributes!: string[];
    /** Dot-path attributes used to read values from transformed rows, when applicable. */
    protected _transformAttributes: string[] | undefined = undefined;
    /** User-facing axis labels. */
    protected _axisLabels!: string[];

    /** Dot-path attribute used for color encoding on source rows, if any. */
    private _sourceColorAttribute: string | undefined = undefined;
    /** Dot-path attribute used for color encoding on transformed rows, when applicable. */
    protected _transformColorAttribute: string | null | undefined = undefined;

    /** Plot title text. */
    protected _title!: string;
    /** D3 tick-format specifiers used by axis renderers. */
    protected _tickFormats!: string[];

    /** Outer chart width in pixels. */
    protected _width: number = 800;
    /** Outer chart height in pixels. */
    protected _height: number = 500;
    /** Plot margins in pixels. */
    protected _margins!: ChartMargins;

    /** Resolved color domain, computed from data after each transform. */
    protected _resolvedDomain: ResolvedDomain | undefined = undefined;

    /** Optional transform config shared by chart implementations that support transformed views. */
    protected _transformConfig?: ChartTransformConfig;

    /** Domain specification for color encoding (from config). */
    protected _domainSpec: ColorMapDomainSpec | undefined = undefined;
    /** Color interpolator used for continuous (numeric) color encoding. */
    protected _colorMapInterpolator: ColorMapInterpolator = ColorMapInterpolator.SEQ_REDS;
    /** Color interpolator used when the color attribute contains categorical (string) values. */
    protected _categoricalColorMapInterpolator: ColorMapInterpolator = ColorMapInterpolator.CAT_OBSERVABLE10;

    /**
     * Initializes shared chart data state from a plot configuration.
     *
     * @param config Plot configuration containing source data, bindings, and transform/display options.
     * @throws If `attributes.axis` is empty or configured bindings are missing/invalid.
     * @throws If `@transform` placeholder is used without a transform config.
     */
    constructor(config: ChartConfig) {
        this._div = config.div;

        this._sourceFeatures = config.collection.features;
        this._data = this._sourceFeatures.map((f, idx) => ({
            ...(f.properties ?? {}),
            autkIds: [idx],
        })) as AutkDatum[];

        const hasTransformPlaceholder = [
            ...(config.attributes?.axis ?? []),
            config.attributes?.color,
        ].includes('@transform');

        if (config.transform?.preset === 'sort' && hasTransformPlaceholder) {
            throw new Error("ChartBaseData: '@transform' cannot be used with the 'sort' preset.");
        }

        const axisAttributes = config.attributes?.axis;
        if (!axisAttributes || axisAttributes.length === 0) {
            throw new Error('ChartBaseData: attributes.axis must contain at least one attribute.');
        }

        const axisLabels = config.labels?.axis ?? [];
        this.validateSourceAttributeBindings(axisAttributes, config.attributes?.color, config.transform);

        this._axisLabels = axisLabels.length > 0
            ? axisLabels
            : [...axisAttributes];
        this._sourceAxisAttributes = [...axisAttributes];

        this._sourceColorAttribute = config.attributes?.color;

        this._title = config.labels?.title || 'Autk Plot';
        this._tickFormats = config.tickFormats ?? ['', ''];

        this._width = config.width || 800;
        this._height = config.height || 500;
        this._margins = config.margins || { left: 40, right: 20, top: 80, bottom: 50 };

        this._domainSpec = config.domainSpec;
        this._colorMapInterpolator = config.colorMapInterpolator ?? ColorMapInterpolator.SEQ_REDS;
        this._categoricalColorMapInterpolator = config.categoricalColorMapInterpolator ?? ColorMapInterpolator.CAT_OBSERVABLE10;

        this._transformConfig = config.transform;
    }

    /**
     * Rebuilds source rows, applies transforms, validates bindings, and delegates rendering.
     *
     * @throws If active render bindings do not resolve on the rendered data.
     */
    public draw(): void {
        this._data = this.buildSourceRows();
        this._transformAttributes = undefined;
        this._transformColorAttribute = undefined;
        this.applyConfiguredTransform();
        this.afterDataRefresh();
        this.validateRenderedAttributeBindings();
        this.computeColorDomain();
        this.render();
    }

    /**
     * Executes the configured transform pipeline and stores the resolved output
     * schema on `_data`, `_transformAttributes`, and `_transformColorAttribute`.
     */
    private applyConfiguredTransform(): void {
        if (!this._transformConfig) {
            return;
        }

        const inputColumns = this._sourceAxisAttributes.filter(column => column !== '@transform');
        const executed = run(this._data, this._transformConfig, inputColumns);
        const resolved = this.resolveTransformResult(executed);

        this._data = resolved.rows;
        this._transformAttributes = resolved.axisAttributes;
        this._transformColorAttribute = resolved.colorAttribute;
    }

    /**
     * Validates configured source bindings against the original input rows.
     *
     * @param axisAttributes Source attributes bound to chart axes.
     * @param colorAttribute Optional source attribute bound to color.
     * @param transform Optional transform configuration associated with the chart.
     * @throws If a configured binding does not resolve on the source data.
     */
    private validateSourceAttributeBindings(
        axisAttributes: string[],
        colorAttribute: string | undefined,
        transform: ChartTransformConfig | undefined,
    ): void {
        const bindings = [
            ...axisAttributes.map((attribute, index) => ({ attribute, channel: `attributes.axis[${index}]` })),
            ...(colorAttribute ? [{ attribute: colorAttribute, channel: 'attributes.color' }] : []),
        ];

        for (const { attribute, channel } of bindings) {
            if (attribute === '@transform') {
                if (!transform) {
                    throw new Error(`ChartBaseData: ${channel} cannot be "@transform" without a transform configuration.`);
                }
                continue;
            }

            if (!this.hasAttribute(this._data, attribute)) {
                throw new Error(`ChartBaseData: ${channel} "${attribute}" does not exist in the source data.`);
            }
        }
    }

    /**
     * Validates the currently active rendered bindings after transforms run.
     *
     * @throws If any active render binding does not resolve on `_data`.
     */
    private validateRenderedAttributeBindings(): void {
        for (const [index, attribute] of this.renderAxisAttributes.entries()) {
            if (!this.hasAttribute(this._data, attribute)) {
                throw new Error(`ChartBaseData: attributes.axis[${index}] "${attribute}" does not exist in the rendered data.`);
            }
        }

        const colorAttribute = this.renderColorAttribute;
        if (colorAttribute && !this.hasAttribute(this._data, colorAttribute)) {
            throw new Error(`ChartBaseData: attributes.color "${colorAttribute}" does not exist in the rendered data.`);
        }
    }

    /**
     * Tests whether a dot-path attribute resolves on at least one row.
     *
     * @param rows Candidate rows to inspect.
     * @param attribute Dot-path attribute to resolve.
     * @returns `true` when the attribute exists on at least one row.
     */
    private hasAttribute(rows: AutkDatum[], attribute: string): boolean {
        if (rows.length === 0) {
            return true;
        }

        return rows.some(row => valueAtPath(row, attribute) !== undefined);
    }

    /**
     * Rebuilds normalized source rows from the current `_sourceFeatures` collection.
     *
     * @returns One `AutkDatum` per source feature with stable `autkIds` provenance.
     */
    private buildSourceRows(): AutkDatum[] {
        return this._sourceFeatures.map((feature, idx) => ({
            ...(feature.properties ?? {}),
            autkIds: [idx],
        })) as AutkDatum[];
    }

    /**
     * Lifecycle hook invoked after `_data` has been refreshed but before render-time
     * validation and color-domain computation.
     */
    protected afterDataRefresh(): void {}

    /**
     * Renders chart DOM, SVG, or HTML nodes for the current internal state.
     */
    abstract render(): void;

    /**
     * Maps a preset-specific executed transform into the rendered row schema
     * expected by chart implementations.
     *
     * @param result Executed transform payload returned by the shared dispatcher.
     * @returns Normalized rendered rows plus any transformed binding metadata.
     */
    protected resolveTransformResult(result: ExecutedChartTransform): ResolvedChartTransform {
        switch (result.preset) {
            case 'binning-1d':
                return { rows: result.rows as AutkDatum[], axisAttributes: ['label', 'value'] };
            case 'binning-2d':
                return { rows: result.rows as AutkDatum[], axisAttributes: ['x', 'y'], colorAttribute: 'value' };
            case 'sort':
                return { rows: result.rows as AutkDatum[] };
            case 'binning-events':
            case 'reduce-series':
                return { rows: result.rows as AutkDatum[], axisAttributes: ['bucket', 'value'] };
        }
    }

    /**
     * Returns the active axis bindings for rendered rows.
     */
    protected get renderAxisAttributes(): string[] {
        return this._transformAttributes ?? this._sourceAxisAttributes;
    }

    /**
     * Returns the active color binding for rendered rows.
     */
    protected get renderColorAttribute(): string | undefined {
        if (this._transformColorAttribute === null) {
            return undefined;
        }
        return this._transformColorAttribute ?? this._sourceColorAttribute;
    }

    /**
     * Updates the active render-time color binding.
     *
     * @param attribute Dot-path attribute to use for color, or `undefined` to clear it.
     */
    protected setRenderColorAttribute(attribute: string | undefined): void {
        if (this._transformAttributes) {
            this._transformColorAttribute = attribute ?? null;
            return;
        }

        this._sourceColorAttribute = attribute;
    }

    /**
     * Computes and caches the active color domain from rendered rows.
     */
    protected computeColorDomain(): void {
        this._resolvedDomain = undefined;

        const colorAttribute = this.renderColorAttribute;
        if (!colorAttribute) return;

        const values = this._data
            .filter(d => d != null)
            .map(d => valueAtPath(d!, colorAttribute))
            .filter(v => v != null && !(typeof v === 'number' && !Number.isFinite(v)));

        if (values.length === 0) return;

        const isCategorical = values.some(v => typeof v === 'string' && isNaN(Number(v as string)));
        const interpolator = isCategorical ? this._categoricalColorMapInterpolator : this._colorMapInterpolator;

        this._resolvedDomain = ColorMap.resolveDomainFromData(
            values as number[] | string[],
            {
                interpolator,
                domainSpec: this._domainSpec ?? { type: ColorMapDomainStrategy.MIN_MAX },
            },
        );
    }
}
