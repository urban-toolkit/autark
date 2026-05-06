import type { FeatureCollection } from 'geojson';
import type { AutkMap, MapEvent } from 'autk-map';
import type { createAutarkProvenance } from '../create-autark-provenance';
import type { MapViewState } from '../types';

export function mountMapInWorkspace(map: AutkMap, body: HTMLElement): () => void {
  const internals = map as AutkMap & { _resizeEvents?: { resize?: () => void } };
  let frame = 0;
  let observer: ResizeObserver | null = null;

  const syncSize = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = 0;
      internals._resizeEvents?.resize?.();
      map.ui.handleResize();
      map.draw();
    });
  };

  map.ui.destroy();
  body.replaceChildren(map.canvas);
  map.canvas.style.width = '100%';
  map.canvas.style.height = '100%';
  map.ui.buildUi();
  syncSize();

  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(syncSize);
    observer.observe(body);
  }

  return () => {
    if (frame) cancelAnimationFrame(frame);
    observer?.disconnect();
  };
}

export function applyThematic(map: AutkMap, collection: FeatureCollection, layerId: string, property: string): void {
  const thematicMap = map as AutkMap & {
    updateThematic?: (id: string, options: { collection: FeatureCollection; property: string }) => void;
  };

  if (property) {
    thematicMap.updateThematic?.(layerId, { collection, property });
    return;
  }

  map.updateRenderInfo(layerId, { renderInfo: { isColorMap: false } });
}

export function createThematicControl(
  map: AutkMap,
  schema: { collection: FeatureCollection },
  layerId: string,
) {
  return {
    selector: '.autk-workspace-select',
    event: 'change' as const,
    actionType: 'MAP_THEMATIC_PROPERTY',
    getLabel: (element: Element) => {
      const value = (element as HTMLSelectElement).value;
      return value ? `Color by: ${value}` : 'Thematic off';
    },
    getStateDelta: (element: Element) => {
      const value = (element as HTMLSelectElement).value;
      return { filters: { thematicProperty: value || null }, ui: { thematicEnabled: !!value } };
    },
    applyState: (element: Element, state: { filters?: Record<string, unknown> }) => {
      const value = (state.filters?.thematicProperty as string | null) ?? '';
      (element as HTMLSelectElement).value = value;
      applyThematic(map, schema.collection, layerId, value);
    },
  };
}

export function createMapForProvenance(
  map: AutkMap,
): NonNullable<Parameters<typeof createAutarkProvenance>[0]['map']> {
  const mapViewApi = map as AutkMap & {
    addViewListener?: (callback: (state: MapViewState) => void) => void;
    removeViewListener?: (callback: (state: MapViewState) => void) => void;
    setViewState?: (state: MapViewState) => void;
    updateRenderInfoProperty?: (layerName: string, property: string, value: unknown) => void;
    updateRenderInfo?: (layerName: string, params: unknown) => void;
  };

  return {
    mapEvents: {
      addEventListener(event: string, fn: (selection: number[], currentLayerId: string) => void) {
        map.events.on(event as MapEvent, ({ selection, layerId: eventLayerId }: { selection: number[]; layerId: string }) => fn(selection, eventLayerId));
      },
      removeEventListener(event: string, fn: (selection: number[], currentLayerId: string) => void) {
        map.events.off(event as MapEvent, fn as never);
      },
    },
    addViewListener: mapViewApi.addViewListener?.bind(map),
    removeViewListener: mapViewApi.removeViewListener?.bind(map),
    setViewState: mapViewApi.setViewState?.bind(map),
    canvas: map.canvas,
    ui: map.ui,
    updateRenderInfoProperty: mapViewApi.updateRenderInfoProperty?.bind(map),
    updateRenderInfo: mapViewApi.updateRenderInfo?.bind(map),
    layerManager: map.layerManager,
  };
}
