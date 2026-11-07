import type {
    Feature,
    GeoJsonProperties,
    Geometry,
} from 'geojson';

import type { AutkDatum } from './types-plot';

import type {
    FilterCondition,
    PlotConfig,
    PlotMargins,
    PlotTransformConfig,
    TopKConfig,
    TransformReducer,
} from './api';

import {
    ColorMapInterpolator,
    ColorMapDomainStrategy,
    ColorMap,
    valueAtPath,
} from '@urban-toolkit/autk-core';
import type { ColorMapDomainSpec, ResolvedDomain } from '@urban-toolkit/autk-core';

import { run, shapeFields } from './transforms';
import type { ExecutedPlotTransform } from './transforms';

import type {
    ProvenanceContribution,
    ProvenanceId,
    ProvenanceRelation,
    ProvenanceStage,
    TransformProvenance,
} from './types-provenance';
import { ProvenanceModel, featureId } from './provenance';
import { describeFilter, matchesFilter } from './transforms/filter';
import { runTopK } from './transforms/top-k';

/** Width of a plot without `width`, and of `width: 'auto'` while its host has no layout. */
const DEFAULT_WIDTH = 800;
/** Smallest width of `width: 'auto'`, so the drawing area never collapses. */
const MIN_AUTO_WIDTH = 160;

/**
 * Normalized transform payload returned by `resolveTransformResult()`.
 *
 * Collapses preset-specific transform outputs into the rendered schema
 * consumed by plot classes.
 */
export type ResolvedPlotTransform = {
    /** Render rows stored on `_data` for the current draw cycle. */
    rows: AutkDatum[];
    /** Optional axis bindings exposed by the transformed row shape. */
    axisAttributes?: string[];
    /** Optional color binding exposed by the transformed row shape. */
    colorAttribute?: string;
    /** Provenance id of each row in `rows`. Required when `rows` are rebuilt or reordered. */
    rowIds?: ProvenanceId[];
};

/**
 * Base class for shared plot data lifecycle.
 *
 * Normalizes input rows, validates configured bindings, runs transforms, and
 * resolves the active rendered schema used by subclasses during drawing.
 */
export abstract class PlotBaseData {
    /** Host element where the plot is rendered. */
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

    /** Outer plot width in pixels. */
    protected _width: number = DEFAULT_WIDTH;
    /** Whether the width follows the host element (`width: 'auto'`). */
    protected _autoWidth: boolean = false;
    /** Outer plot height in pixels. */
    protected _height: number = 500;
    /** Plot margins in pixels. */
    protected _margins!: PlotMargins;

    /** Resolved color domain, computed from data after each transform. */
    protected _resolvedDomain: ResolvedDomain | undefined = undefined;

    /** Optional transform config shared by plot implementations that support transformed views. */
    protected _transformConfig?: PlotTransformConfig;

    /** Provenance graph of the current draw cycle, from source features to rendered rows. */
    protected _provenance!: ProvenanceModel;
    /** Provenance id of each rendered row object in `_data`. */
    protected _rowIds: WeakMap<object, ProvenanceId> = new WeakMap();
    /** Provenance produced by the last executed transform, if any. */
    private _transformProvenance: TransformProvenance | undefined = undefined;
    /** Conditions every source feature must pass before the transform, if any. */
    protected _filter: FilterCondition[] = [];
    /** Source feature indices that passed the filter in the current draw cycle. */
    private _keptFeatures: number[] = [];
    /** Top-k cut applied to rendered rows after the transform, if any. */
    protected _topK: TopKConfig | undefined = undefined;

    /** Domain specification for color encoding (from config). */
    protected _domainSpec: ColorMapDomainSpec | undefined = undefined;
    /** Color interpolator used for continuous (numeric) color encoding. */
    protected _colorMapInterpolator: ColorMapInterpolator = ColorMapInterpolator.SEQ_REDS;
    /** Color interpolator used when the color attribute contains categorical (string) values. */
    protected _categoricalColorMapInterpolator: ColorMapInterpolator = ColorMapInterpolator.CAT_OBSERVABLE10;

    /**
     * Initializes shared plot data state from a plot configuration.
     *
     * @param config Plot configuration containing source data, bindings, and transform/display options.
     * @throws If `attributes.axis` is empty or configured bindings are missing/invalid.
     * @throws If `@transform` placeholder is used without a transform config.
     */
    constructor(config: PlotConfig) {
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
            throw new Error("PlotBaseData: '@transform' cannot be used with the 'sort' preset.");
        }

        const axisAttributes = config.attributes?.axis;
        if (!axisAttributes || axisAttributes.length === 0) {
            throw new Error('PlotBaseData: attributes.axis must contain at least one attribute.');
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

        this._autoWidth = config.width === 'auto';
        this._width = (config.width === 'auto' ? undefined : config.width) || DEFAULT_WIDTH;
        this._height = config.height || 500;
        this._margins = config.margins || { left: 40, right: 20, top: 80, bottom: 50 };

        this._domainSpec = config.domainSpec;
        this._colorMapInterpolator = config.colorMapInterpolator ?? ColorMapInterpolator.SEQ_REDS;
        this._categoricalColorMapInterpolator = config.categoricalColorMapInterpolator ?? ColorMapInterpolator.CAT_OBSERVABLE10;

        this._transformConfig = config.transform;

        this._filter = config.filter ? (Array.isArray(config.filter) ? config.filter : [config.filter]) : [];
        for (const condition of this._filter) {
            if (!this.hasAttribute(this._data, condition.attribute)) {
                throw new Error(`PlotBaseData: filter attribute "${condition.attribute}" does not exist in the source data.`);
            }
        }

        if (config.topK && !this.supportsTopK()) {
            throw new Error('PlotBaseData: topK is not supported by this plot type.');
        }
        this._topK = config.topK;
    }

    /**
     * Whether the plot can render a top-k cut of its rows. Plots opt in by overriding.
     *
     * @returns `true` when rows have a label (`axis[0]`) and a rankable value (`axis[1]`).
     */
    protected supportsTopK(): boolean {
        return false;
    }

    /**
     * Rebuilds source rows, applies transforms, validates bindings, and delegates rendering.
     *
     * @throws If active render bindings do not resolve on the rendered data.
     */
    public draw(): void {
        this.resolveSize();
        this._data = this.buildSourceRows();
        if (this._filter.length > 0) {
            this._data = this._data.filter(row => matchesFilter(row, this._filter));
            this._keptFeatures = this._data.map(row => row.autkIds?.[0] ?? -1);
        }
        this._transformAttributes = undefined;
        this._transformColorAttribute = undefined;
        this._transformProvenance = undefined;
        this.applyConfiguredTransform();
        this.buildProvenance();
        this.afterDataRefresh();
        this.validateRenderedAttributeBindings();
        this.computeColorDomain();
        this.render();
        this.afterRender();
    }

    /**
     * Resolves the plot size before a draw. With `width: 'auto'` the width is
     * the content width of the host element.
     */
    protected resolveSize(): void {
        if (this._autoWidth) this._width = this.hostWidth();
    }

    /**
     * Content width of the host element (without its padding), or the default
     * width while it has no layout.
     *
     * @returns Width in pixels, at least `MIN_AUTO_WIDTH`.
     */
    protected hostWidth(): number {
        const style = getComputedStyle(this._div);
        const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
        const width = Math.floor(this._div.clientWidth - padding);
        return width > 0 ? Math.max(width, MIN_AUTO_WIDTH) : DEFAULT_WIDTH;
    }

    /**
     * Provenance graph of the current draw cycle.
     *
     * Stages run from `D0` (source features) through the transform stages to
     * `M` (rendered marks) once the plot has drawn.
     */
    get provenance(): ProvenanceModel {
        return this._provenance;
    }

    /**
     * Builds the provenance graph for the rows stored on `_data`.
     *
     * The chain is `D0 → [filter] → [transform stages] → [top-k]`, numbered in
     * order. Without a transform, rendered rows are the (kept) source features.
     * The top-k cut replaces `_data` with its output rows.
     */
    private buildProvenance(): void {
        const stages: ProvenanceStage[] = [{ name: 'D0', label: 'features', ids: this._sourceFeatures.map((_f, idx) => featureId(idx)) }];
        const relations: ProvenanceRelation[] = [];
        let contributions: ProvenanceContribution[];
        let reducer: TransformReducer | undefined;
        let rowIds: ProvenanceId[];

        // ---- Filter: kept features form their own stage; excluded ones have no image.
        const filtered = this._filter.length > 0;
        const entryId = (index: number) => filtered ? `kept:${index}` : featureId(index);
        if (filtered) {
            stages.push({
                name: 'D1',
                label: 'kept',
                note: `filter: ${describeFilter(this._filter)}`,
                ids: this._keptFeatures.map(entryId),
            });
            relations.push({
                source: 'D0',
                target: 'D1',
                pairs: this._keptFeatures.map(index => ({ source: featureId(index), target: entryId(index), weight: 1 })),
            });
        }
        const entry = stages[stages.length - 1].name;

        // ---- Transform: its stages are renumbered after the filter stage.
        const transform = this._transformProvenance;
        if (transform) {
            const offset = stages.length - 1;
            const rename = (name: string) => name === 'D0' ? entry : `D${Number(name.slice(1)) + offset}`;
            stages.push(...transform.stages.map(stage => ({ ...stage, name: rename(stage.name) })));
            relations.push(...transform.relations.map(relation => ({
                source: rename(relation.source),
                target: rename(relation.target),
                pairs: filtered && relation.source === 'D0'
                    ? relation.pairs.map(pair => ({ ...pair, source: entryId(Number(pair.source.slice('feature:'.length))) }))
                    : relation.pairs,
            })));
            contributions = transform.contributions;
            reducer = transform.reducer;
            rowIds = transform.rowIds;
        } else {
            rowIds = this._data.map((row, index) => entryId(row.autkIds?.[0] ?? index));
            // With a top-k cut, one-to-one rows may be gathered: units carry the row value.
            const valueAttr = this.renderAxisAttributes[1];
            contributions = this._data.map((row, index) => {
                const value = this._topK ? Number(valueAtPath(row, valueAttr)) : 1;
                return { source: featureId(row.autkIds?.[0] ?? index), target: rowIds[index], value: Number.isFinite(value) ? value : 0 };
            });
            if (this._topK) reducer = 'sum';
        }

        // ---- Top-k: the cut is a stage after the rendered rows.
        if (this._topK) {
            const result = runTopK({
                rows: this._data,
                rowIds,
                contributions,
                reducer: reducer ?? 'count',
                labelAttr: this.renderAxisAttributes[0],
                valueAttr: this.renderAxisAttributes[1],
                config: this._topK,
                sourceStage: stages[stages.length - 1].name,
                stageName: `D${stages.length}`,
            });
            this._data = result.rows;
            rowIds = result.rowIds;
            contributions = result.contributions;
            stages.push(result.stage);
            relations.push(result.relation);
        }

        this._rowIds = new WeakMap();
        this._data.forEach((row, index) => this._rowIds.set(row as object, rowIds[index]));
        this._provenance = new ProvenanceModel(stages, relations, contributions, reducer);
    }

    /**
     * Returns the provenance id of a rendered row.
     *
     * @param d Bound datum of a mark.
     * @returns Row id, or `undefined` when the datum is not a rendered row.
     */
    protected rowIdOf(d: unknown): ProvenanceId | undefined {
        return d != null && typeof d === 'object' ? this._rowIds.get(d) : undefined;
    }

    /**
     * Lifecycle hook invoked after `render()` completes a draw cycle.
     */
    protected afterRender(): void {}

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

        this._transformProvenance = { ...executed.provenance, rowIds: resolved.rowIds ?? executed.provenance.rowIds };
        this._data = resolved.rows;
        this._transformAttributes = resolved.axisAttributes;
        this._transformColorAttribute = resolved.colorAttribute;
    }

    /**
     * Validates configured source bindings against the original input rows.
     *
     * @param axisAttributes Source attributes bound to plot axes.
     * @param colorAttribute Optional source attribute bound to color.
     * @param transform Optional transform configuration associated with the plot.
     * @throws If a configured binding does not resolve on the source data.
     */
    private validateSourceAttributeBindings(
        axisAttributes: string[],
        colorAttribute: string | undefined,
        transform: PlotTransformConfig | undefined,
    ): void {
        const bindings = [
            ...axisAttributes.map((attribute, index) => ({ attribute, channel: `attributes.axis[${index}]` })),
            ...(colorAttribute ? [{ attribute: colorAttribute, channel: 'attributes.color' }] : []),
        ];

        for (const { attribute, channel } of bindings) {
            if (attribute === '@transform') {
                if (!transform) {
                    throw new Error(`PlotBaseData: ${channel} cannot be "@transform" without a transform configuration.`);
                }
                continue;
            }

            if (!this.hasAttribute(this._data, attribute)) {
                throw new Error(`PlotBaseData: ${channel} "${attribute}" does not exist in the source data.`);
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
                throw new Error(`PlotBaseData: attributes.axis[${index}] "${attribute}" does not exist in the rendered data.`);
            }
        }

        const colorAttribute = this.renderColorAttribute;
        if (colorAttribute && !this.hasAttribute(this._data, colorAttribute)) {
            throw new Error(`PlotBaseData: attributes.color "${colorAttribute}" does not exist in the rendered data.`);
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
     * Renders plot DOM, SVG, or HTML nodes for the current internal state.
     */
    abstract render(): void;

    /**
     * Maps a preset-specific executed transform into the rendered row schema
     * expected by plot implementations.
     *
     * @param result Executed transform payload returned by the shared dispatcher.
     * @returns Normalized rendered rows plus any transformed binding metadata.
     */
    protected resolveTransformResult(result: ExecutedPlotTransform): ResolvedPlotTransform {
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
            case 'flows':
                return { rows: result.rows as AutkDatum[], axisAttributes: ['label', 'value'] };
            case 'box-stats':
                return { rows: result.rows as AutkDatum[], axisAttributes: ['category', 'median'] };
            case 'hierarchy':
            case 'cumulative':
            case 'fold':
            case 'density':
                return { rows: result.rows as AutkDatum[], axisAttributes: ['label', 'value'] };
            case 'registered':
                return { rows: result.rows, axisAttributes: shapeFields(result.shape) };
            case 'binning-hex':
                return { rows: result.rows as AutkDatum[], axisAttributes: ['label', 'value'], colorAttribute: 'value' };
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
