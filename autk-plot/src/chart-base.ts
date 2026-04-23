import type {
    Feature,
    GeoJsonProperties,
    Geometry,
} from 'geojson';

import type { ChartConfig, ChartMargins, ChartTransformConfig } from './api';

import { EventEmitter } from './types-core';
import type { ChartEventRecord } from './types-events';
import type { ResolvedDomain } from './types-core';

import { TransformHandler } from './handlers/transform-handler';
import { InteractionHandler } from './handlers/interaction-handler';


export abstract class ChartBase {
    readonly _div: HTMLElement;
    readonly _title: string;
    readonly _tickFormats: string[];

    readonly _width: number;
    readonly _height: number;
    readonly _margins: ChartMargins;

    readonly _chartEvents: EventEmitter<ChartEventRecord>;

    readonly _transformHandler: TransformHandler;
    readonly _interactionHandler: InteractionHandler;

    protected _data: any[];
    protected _axisLabels: string[];
    protected _colorProperty: 'fill' | 'stroke' = 'fill';
    protected _resolvedDomain: ResolvedDomain | undefined;
    protected _transformConfig: ChartTransformConfig | undefined;

    constructor(config: ChartConfig) {
        this._div = config.div;

        this._title = config.labels?.title || 'Autk Plot';
        this._tickFormats = config.tickFormats ?? ['', ''];

        this._width = config.width || 800;
        this._height = config.height || 500;
        this._margins = config.margins || { left: 40, right: 20, top: 80, bottom: 50 };

        this._chartEvents = new EventEmitter();

        this._transformHandler = new TransformHandler(config);
        this._data = this._transformHandler.data;
        this._axisLabels = this._transformHandler.axisLabels;
        this._transformConfig = (this._transformHandler as any)._transformConfig;

        this._interactionHandler = new InteractionHandler(
            config.div,
            this._width,
            this._height,
            this._margins,
            config.events ?? [],
            this._chartEvents,
            config.transform,
        );
    }

    get selection(): number[] {
        return this._interactionHandler.selection;
    }

    get events(): EventEmitter<ChartEventRecord> {
        return this._chartEvents;
    }

    updateCollection(collection: { features: Feature<Geometry, GeoJsonProperties>[] }): void {
        this._transformHandler.updateCollection(collection);
        this._interactionHandler.resetSelectionState();
        this.draw();
    }

    setSelection(selection: number[]): void {
        this._interactionHandler.setSelection(selection);
    }

    public draw(): void {
        this._transformHandler.applyTransform();
        this._data = this._transformHandler.data;
        this._interactionHandler.configureSignalListeners();
        this._transformHandler.validateRenderedAttributeBindings();
        this._transformHandler.computeColorDomain();
        this._resolvedDomain = (this._transformHandler as any)._resolvedDomain;
        this.render();
    }

    public configureSignalListeners(): void {
        this._interactionHandler.configureSignalListeners();
    }

    public render(): void {}

    protected get data() {
        return this._transformHandler.data;
    }

    protected get renderAxisAttributes(): string[] {
        return this._transformHandler.renderAxisAttributes;
    }

    protected get renderColorAttribute(): string | undefined {
        return this._transformHandler.renderColorAttribute;
    }

    protected setRenderColorAttribute(attribute: string | undefined): void {
        this._transformHandler.setRenderColorAttribute(attribute);
    }

    protected getMarkColor(d: unknown): string {
        if (this._interactionHandler.isMarkHighlighted(d)) {
            return '#ff6600';
        }
        return this._transformHandler.getMarkColor(d);
    }

    protected renderSelection(): void {
        this._interactionHandler.renderSelection();
    }

    protected applyMarkStyles(svgs: any): void {
        const handler = this;
        svgs.style('fill', (d: unknown) => handler.getMarkColor(d));
    }

    protected onSelectionUpdated(): void {}

    protected isMarkHighlighted(d: unknown): boolean {
        return this._interactionHandler.isMarkHighlighted(d);
    }

    protected computeColorDomain(): void {
        this._transformHandler.computeColorDomain();
    }

    protected clickEvent(): void {
        this._interactionHandler.configureSignalListeners();
    }

    protected brushEvent(): void {
        this._interactionHandler.configureSignalListeners();
    }

    protected brushXEvent(): void {
        this._interactionHandler.configureSignalListeners();
    }

    protected brushYEvent(): void {
        this._interactionHandler.configureSignalListeners();
    }
}