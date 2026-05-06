import type { FeatureCollection } from 'geojson';
import type { AutkMap } from 'autk-map';
import { createAutarkProvenance, type AutarkProvenanceApi } from './create-autark-provenance';
import { renderProvenanceTrailUI } from './provenance-trail-ui';
import { buildInsightsChartSchema } from './charts/chart-config';
import type { InsightsChartSchema } from './charts/types';
import { createChartModalController } from './charts/chart-modal';
import type { IDbForProvenance } from './adapters/db-adapter';
import type { MapSelectorConfig } from './adapters/map-adapter';
import { createInsightsWorkspaceShell } from './ui/workspace-shell';
import { renderWorkspaceSessionInsights } from './ui/workspace-session-insights';
import { ensureInsightsWorkspaceStyles } from './ui/workspace-styles';
import { bindWorkspaceTabs } from './ui/workspace-tabs';
import { createWorkspaceCharts, applySchemaToShell } from './workspace/charts';
import { createMapForProvenance, createThematicControl, applyThematic, mountMapInWorkspace } from './workspace/map-host';
import { createWorkspacePlotAdapter } from './workspace/plot-adapter';
import { PlotType } from './types';

export interface RenderInsightsWorkspaceOptions {
  container: HTMLElement;
  map: AutkMap;
  collection: FeatureCollection;
  layerId: string;
  db?: IDbForProvenance;
  title?: string;
  description?: string;
  mapConfig?: MapSelectorConfig;
}

export interface RenderInsightsWorkspaceResult {
  provenance: AutarkProvenanceApi;
  schema: InsightsChartSchema;
  destroy(): void;
}

export function renderInsightsWorkspace(options: RenderInsightsWorkspaceOptions): RenderInsightsWorkspaceResult {
  const { container, map, collection, layerId, db, title, description, mapConfig } = options;

  ensureInsightsWorkspaceStyles();
  const schema = buildInsightsChartSchema(collection);
  const shell = createInsightsWorkspaceShell(container, title, description);
  const detachTabs = bindWorkspaceTabs(shell.root);

  applySchemaToShell(shell, schema);
  const unmountMap = mountMapInWorkspace(map, shell.mapBody);
  const charts = createWorkspaceCharts(shell, schema);
  const chartModal = createChartModalController(charts.modalDescriptors);

  const thematicControl = createThematicControl(map, schema, layerId);
  shell.thematicSelect.addEventListener('change', () => {
    applyThematic(map, schema.collection, layerId, shell.thematicSelect.value);
  });

  const provenance = createAutarkProvenance({
    map: createMapForProvenance(map),
    plots: [
      createWorkspacePlotAdapter(charts.scatter, 'Scatterplot', PlotType.SCATTERPLOT),
      createWorkspacePlotAdapter(charts.bar, 'Bar Chart', PlotType.BARCHART),
      createWorkspacePlotAdapter(charts.parallel, 'Parallel Coordinates', PlotType.PARALLEL_COORDINATES),
      createWorkspacePlotAdapter(charts.histogram, 'Histogram', PlotType.HISTOGRAM),
    ],
    db,
    mapConfig: { ...(mapConfig ?? {}), customControls: [...(mapConfig?.customControls ?? []), thematicControl] },
  });

  const destroyTrail = renderProvenanceTrailUI({
    provenance,
    container: shell.provenanceTrail,
    showInsights: false,
    showTimestamps: true,
    showGraph: true,
    showPathList: true,
    showBackForward: true,
  });

  const updateNodeCount = () => {
    const count = provenance.getGraph().nodes.size;
    shell.nodeCountBadge.textContent = `${count} step${count !== 1 ? 's' : ''} recorded`;
    renderWorkspaceSessionInsights(shell.chartsInsights, provenance);
    chartModal.syncSelection();
  };

  const unsubscribe = provenance.addObserver(updateNodeCount);
  updateNodeCount();

  return {
    provenance,
    schema,
    destroy: () => {
      unsubscribe();
      destroyTrail();
      detachTabs();
      chartModal.destroy();
      unmountMap();
      container.innerHTML = '';
    },
  };
}
