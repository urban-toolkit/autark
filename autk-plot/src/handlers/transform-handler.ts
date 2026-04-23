import type {
    Feature,
    GeoJsonProperties,
    Geometry,
} from 'geojson';

import type { AutkDatum } from '../types-chart';

import type { ChartConfig, ChartTransformConfig } from '../api';

import {
    ColorMapInterpolator,
    ColorMapDomainStrategy,
    ColorMap,
    valueAtPath,
} from '../types-core';
import type { ColorMapDomainSpec, ResolvedDomain } from '../types-core';

import { run, type ExecutedChartTransform } from '../transforms';


type ResolvedChartTransform = {
    rows: AutkDatum[];
    axisAttributes?: string[];
    colorAttribute?: string;
};

export class TransformHandler {
    readonly sourceFeatures: Feature<Geometry, GeoJsonProperties>[];
    readonly data: AutkDatum[];

    private _sourceAxisAttributes: string[] = [];
    private _transformAttributes: string[] | undefined = undefined;
    readonly axisLabels: string[] = [];

    private _sourceColorAttribute: string | undefined = undefined;
    private _transformColorAttribute: string | null | undefined = undefined;

    private _domainSpec: ColorMapDomainSpec | undefined = undefined;
    private _colorMapInterpolator: ColorMapInterpolator = ColorMapInterpolator.SEQ_REDS;
    private _categoricalColorMapInterpolator: ColorMapInterpolator = ColorMapInterpolator.CAT_OBSERVABLE10;

    private _resolvedDomain: ResolvedDomain | undefined = undefined;
    private _transformConfig: ChartTransformConfig | undefined = undefined;

    constructor(config: ChartConfig) {
        this.sourceFeatures = config.collection.features;
        this.data = this.buildSourceRows();

        const hasTransformPlaceholder = [
            ...(config.attributes?.axis ?? []),
            config.attributes?.color,
        ].includes('@transform');

        if (config.transform?.preset === 'sort' && hasTransformPlaceholder) {
            throw new Error("TransformHandler: '@transform' cannot be used with the 'sort' preset.");
        }

        const axisAttributes = config.attributes?.axis;
        if (!axisAttributes || axisAttributes.length === 0) {
            throw new Error('TransformHandler: attributes.axis must contain at least one attribute.');
        }

        this.axisLabels = config.labels?.axis ?? [];
        this.validateSourceAttributeBindings(axisAttributes, config.attributes?.color, config.transform);

        this._sourceAxisAttributes = [...axisAttributes];
        this._sourceColorAttribute = config.attributes?.color;

        this._domainSpec = config.domainSpec;
        this._colorMapInterpolator = config.colorMapInterpolator ?? ColorMapInterpolator.SEQ_REDS;
        this._categoricalColorMapInterpolator = config.categoricalColorMapInterpolator ?? ColorMapInterpolator.CAT_OBSERVABLE10;

        this._transformConfig = config.transform;
    }

    get renderAxisAttributes(): string[] {
        return this._transformAttributes ?? this._sourceAxisAttributes;
    }

    get renderColorAttribute(): string | undefined {
        if (this._transformColorAttribute === null) {
            return undefined;
        }
        return this._transformColorAttribute ?? this._sourceColorAttribute;
    }

    setRenderColorAttribute(attribute: string | undefined): void {
        if (this._transformAttributes) {
            this._transformColorAttribute = attribute ?? null;
            return;
        }

        this._sourceColorAttribute = attribute;
    }

    applyTransform(): void {
        if (!this._transformConfig) {
            return;
        }

        const inputColumns = this._sourceAxisAttributes.filter(column => column !== '@transform');
        const executed = run(this.data, this._transformConfig, inputColumns);
        const resolved = this.resolveTransformResult(executed);

        (this as any).data = resolved.rows;
        this._transformAttributes = resolved.axisAttributes;
        this._transformColorAttribute = resolved.colorAttribute;
    }

    validateRenderedAttributeBindings(): void {
        for (const [index, attribute] of this.renderAxisAttributes.entries()) {
            if (!this.hasAttribute(attribute)) {
                throw new Error(`TransformHandler: attributes.axis[${index}] "${attribute}" does not exist in the rendered data.`);
            }
        }

        const colorAttribute = this.renderColorAttribute;
        if (colorAttribute && !this.hasAttribute(colorAttribute)) {
            throw new Error(`TransformHandler: attributes.color "${colorAttribute}" does not exist in the rendered data.`);
        }
    }

    computeColorDomain(): void {
        this._resolvedDomain = undefined;

        const colorAttribute = this.renderColorAttribute;
        if (!colorAttribute) return;

        const values = this.data
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

    getMarkColor(d: unknown): string {
        const datum = d as AutkDatum;

        const colorAttribute = this.renderColorAttribute;
        if (!colorAttribute || !this._resolvedDomain) {
            return '#4682b4';
        }

        if (typeof this._resolvedDomain[0] === 'string') {
            const categories = this._resolvedDomain as string[];
            const rawValue = valueAtPath(datum, colorAttribute);
            if (rawValue === null || rawValue === undefined) {
                return '#4682b4';
            }

            const rawVal = String(rawValue);
            const idx = categories.indexOf(rawVal);
            if (idx < 0) {
                return '#4682b4';
            }

            const t = categories.length <= 1 ? 0.5 : Math.max(0, idx) / (categories.length - 1);
            const interpolator = this._categoricalColorMapInterpolator ?? ColorMapInterpolator.CAT_OBSERVABLE10;
            const { r, g, b } = ColorMap.getColor(t, interpolator, categories);
            return `rgb(${r},${g},${b})`;
        } else {
            const rawValue = valueAtPath(datum, colorAttribute);
            const rawVal = Number(rawValue);
            if (rawValue === null || rawValue === undefined || !Number.isFinite(rawVal)) {
                return '#4682b4';
            }

            const numDomain = this._resolvedDomain as [number, number] | [number, number, number];
            const interpolator = this._colorMapInterpolator ?? ColorMapInterpolator.SEQ_REDS;
            const { r, g, b } = ColorMap.getColor(rawVal, interpolator, numDomain);
            return `rgb(${r},${g},${b})`;
        }
    }

    resolveTransformResult(result: ExecutedChartTransform): ResolvedChartTransform {
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

    updateCollection(collection: { features: Feature<Geometry, GeoJsonProperties>[] }): void {
        (this as any).sourceFeatures = collection.features;
        (this as any).data = this.buildSourceRows();
    }

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
                    throw new Error(`TransformHandler: ${channel} cannot be "@transform" without a transform configuration.`);
                }
                continue;
            }

            if (!this.hasAttribute(attribute)) {
                throw new Error(`TransformHandler: ${channel} "${attribute}" does not exist in the source data.`);
            }
        }
    }

    private hasAttribute(attribute: string): boolean {
        if (this.data.length === 0) {
            return true;
        }

        return this.data.some(row => valueAtPath(row, attribute) !== undefined);
    }

    private buildSourceRows(): AutkDatum[] {
        return this.sourceFeatures.map((feature, idx) => ({
            ...(feature.properties ?? {}),
            autkIds: [idx],
        })) as AutkDatum[];
    }
}