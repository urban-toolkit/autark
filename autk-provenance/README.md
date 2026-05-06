# autk-provenance: Provenance Tracking for Urban Visual Analytics

<div align="center">
  <img src="../logo.png" alt="Autark Logo" height="200"/></br>
</div>
<br>

**autk-provenance** is the provenance and session-tracking module of the Autark ecosystem. It records every analytical interaction — map picks, plot selections, layer toggles, database operations, compute runs — as nodes in a persistent, branching provenance graph. Analysts can navigate back and forward through their analysis history, branch into alternative exploration paths, annotate key findings, and export the full session graph for reproducibility or sharing.

The library can be used standalone (with any custom state shape) or as a drop-in layer on top of the other Autark modules (`autk-map`, `autk-plot`, `autk-db`, `autk-compute`). The highest-level entry point — `renderInsightsWorkspace` — wires an entire coordinated analytics workspace (map + four charts + provenance trail + insights panel) from a single function call.

## Resources

- [Documentation](https://autarkjs.org/introduction.html)
- [Examples](https://autarkjs.org/gallery/)
- [Use Cases](https://autarkjs.org/usecases/)

---

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Installation](#installation)
3. [Quick Start — Full Workspace](#quick-start--full-workspace)
4. [Quick Start — Autark Integration](#quick-start--autark-integration)
5. [Quick Start — Generic State](#quick-start--generic-state)
6. [State Shape](#state-shape)
7. [Provenance Graph](#provenance-graph)
8. [API Reference](#api-reference)
   - [createAutarkProvenance](#createautarkprovenance)
   - [renderInsightsWorkspace](#renderinsightsworkspace)
   - [renderProvenanceTrailUI](#renderprovenancetrailui)
   - [createProvenance](#createprovenance)
   - [Insight Engine](#insight-engine)
9. [Adapters](#adapters)
   - [Map Adapter](#map-adapter)
   - [Plot Adapter](#plot-adapter)
   - [DB Adapter](#db-adapter)
   - [Compute Adapter](#compute-adapter)
10. [Custom Controls](#custom-controls)
11. [Tracked Interactions](#tracked-interactions)
12. [Session Insights](#session-insights)
13. [Export and Import](#export-and-import)
14. [Building](#building)
15. [Development Workflow](#development-workflow)

---

## Core Concepts

### Provenance Graph

Every interaction creates a **node** in a directed acyclic graph. Each node stores:

- A full snapshot of the application state at that moment
- The action type and human-readable label that created it
- A timestamp
- Optional analyst annotations

Nodes are connected from parent to child. When an analyst navigates back to an earlier node and then takes a new action, a new branch is created — the graph is non-linear, recording the full history of exploratory paths rather than a single linear undo stack.

### State Restoration

Navigating to any node in the graph (via the trail UI, the graph modal, or programmatic API) triggers a full **state restoration**: the map highlights the correct features, plot selections are re-applied, layer visibility and thematic state are restored, and the camera viewport is reset. All coordinated views update simultaneously.

### Adapters

Each Autark module is connected through an **adapter** that:

1. **Records** interactions by listening to module events (DOM clicks, method calls, event emitters) and writing nodes to the graph.
2. **Applies state** from any node back onto the module when the analyst navigates the graph.

Recording is guarded so that state-restoration calls do not themselves generate new provenance nodes.

### Cross-view Coordination

Selections are coordinated across all connected views. Picking features on the map highlights the corresponding rows in every plot. Selecting a point in the scatter plot highlights the matching map feature and plot rows in all other charts. This coordination is tracked in the provenance state so every node stores a complete cross-view snapshot.

---

## Installation

```bash
npm install autk-provenance
```

`autk-provenance` depends on `autk-plot` at runtime when using `renderInsightsWorkspace`. Build `autk-plot` before `autk-provenance` in any build pipeline.

---

## Quick Start — Full Workspace

`renderInsightsWorkspace` is the highest-level entry point. It builds a complete coordinated analytics workspace — map, four charts (scatter plot, bar chart, parallel coordinates, histogram), a provenance trail panel, and a session insights panel — from a single call.

```ts
import { renderInsightsWorkspace } from 'autk-provenance';
import type { AutkMap } from 'autk-map';
import type { FeatureCollection } from 'geojson';

const root = document.getElementById('app') as HTMLElement;

// Assumes map and collection are already set up
renderInsightsWorkspace({
  container: root,
  map,
  collection, // GeoJSON FeatureCollection with numeric feature properties
  layerId: 'neighborhoods',
  title: 'NYC Neighborhood Analysis',
  description: 'Cross-view exploration of neighborhood indicators',
});
```

The workspace renders:

The workspace renders:

- A persistent **Map panel** (left side) with the 3D map and a "Color by" thematic dropdown
- A **Charts tab** (right side) with four coordinated charts (scatter, bar, parallel coordinates, histogram)
- A **Provenance Trail tab** (right side) with the interactive graph, the step trail, and back/forward navigation
- A **Session Insights section** always visible below the tabs, updating as you interact

All interactions across map and charts are automatically tracked. Chart axes and groupings are inferred from the GeoJSON properties.

### Full options

```ts
renderInsightsWorkspace({
  container: root,
  map,                           // AutkMap instance (required)
  collection,                    // GeoJSON FeatureCollection (required)
  layerId: 'neighborhoods',      // Layer ID registered in the map (required)
  db,                            // Optional: autk-db instance for DB provenance
  title: 'My Analysis',          // Workspace header title
  description: 'Description…',   // Workspace header subtitle
  mapConfig: {                   // Optional: override map UI selectors or add custom controls
    customControls: [...],
  },
});
```

The returned object exposes the provenance API and a `destroy()` method for cleanup:

```ts
const { provenance, schema, destroy } = renderInsightsWorkspace({ ... });

// Inspect the current provenance graph
console.log(provenance.getGraph());

// Clean up when done
destroy();
```

---

## Quick Start — Autark Integration

Use `createAutarkProvenance` when you want to wire provenance into your own custom layout rather than using the pre-built workspace shell.

```ts
import { createAutarkProvenance, renderProvenanceTrailUI } from 'autk-provenance';
import { PlotType } from 'autk-provenance';

const provenance = createAutarkProvenance({
  map: mapForProvenance, // IMapForProvenance adapter object
  plots: [
    Object.assign(scatter, {
      plotId: 'Scatterplot',
      plotType: PlotType.SCATTERPLOT,
      plotEvents: {
        addEventListener: (event, fn) => scatter.events.on(event, ({ selection }) => fn(selection)),
        removeEventListener: (event, fn) => scatter.events.off(event, fn),
      },
      setOwnedSelection: (ids) => scatter.setOwnedSelection(ids),
      setHighlightedIds: (ids) => scatter.setSelection(ids),
    }),
  ],
  db,
});

// Render the trail UI into a sidebar container
const destroyTrail = renderProvenanceTrailUI({
  provenance,
  container: document.getElementById('provenance-sidebar')!,
  showGraph: true,
  showPathList: true,
  showBackForward: true,
  showTimestamps: true,
});

// Navigate
provenance.goBackOneStep();
provenance.goForwardOneStep();
provenance.goToNode(nodeId);

// Annotate a key finding
const currentNode = provenance.getCurrentNode();
if (currentNode) provenance.annotateNode(currentNode.id, 'High density cluster in Brooklyn');

// Export for sharing
const json = provenance.exportGraph();
```

---

## Quick Start — Generic State

Use `createProvenance` to track any custom state shape with your own adapter, without any dependency on Autark modules.

```ts
import { createProvenance } from 'autk-provenance';

type AppState = {
  selectedRegion: string | null;
  year: number;
  showGrid: boolean;
};

const provenance = createProvenance<AppState>({
  initialState: { selectedRegion: null, year: 2024, showGrid: false },
  adapter: {
    applyState(state) {
      updateUI(state.selectedRegion, state.year, state.showGrid);
    },
  },
});

// Record interactions manually
provenance.applyAction('SELECT_REGION', 'Selected Brooklyn', { selectedRegion: 'Brooklyn' });
provenance.applyAction('CHANGE_YEAR', 'Year: 2020', { year: 2020 });

// Navigate
provenance.goBackOneStep();
```

---

## State Shape

The canonical state type for Autark provenance is `AutarkProvenanceState`:

```ts
interface AutarkProvenanceState {
  selection: {
    /** Map pick: the layer and feature IDs currently selected on the map. */
    map: { layerId: string; ids: number[] } | null;
    /** Per-plot selection, keyed by plotId. */
    plots: Record<string, { ids: number[]; plotType: PlotType }>;
  };
  ui?: {
    mapMenuOpen?: boolean;
    activeLayerId?: string | null;
    visibleLayerIds?: string[];
    thematicEnabled?: boolean;
  };
  /** Camera viewport: eye, lookAt, up vectors for 3D restoration. */
  view?: MapViewState;
  /** Database workspace and layer references for DB state restoration. */
  data?: {
    workspace: string;
    layerTableNames: string[];
    activeLayerIds?: string[];
  };
  /**
   * Arbitrary filter state contributed by custom UI controls
   * (dropdowns, sliders, date pickers, etc.).
   */
  filters?: Record<string, unknown>;
}
```

Each provenance node stores a full snapshot of this state. Navigating to a node restores the complete snapshot.

---

## Provenance Graph

The graph data structure is:

```ts
interface ProvenanceGraph<T> {
  nodes: Map<string, ProvenanceNode<T>>;
  rootId: string;
  currentId: string;
}

interface ProvenanceNode<T> {
  id: string;
  parentId: string | null;
  childrenIds: string[];
  state: T;
  actionLabel: string;
  actionType: ProvenanceAction | string;
  timestamp: number;
  metadata?: Record<string, unknown>; // used for analyst annotations
}
```

The graph is a **directed tree** rooted at the `ROOT` node created on initialization. Each action appends a child to the current node. Navigating back and then taking a new action branches the tree, creating a new child from the historical node.

`getPathFromRoot()` returns the linear path of nodes from the root to the current node — the "main branch" visible in the trail UI.

---

## API Reference

### `createAutarkProvenance`

Creates a provenance instance wired to all provided Autark modules.

```ts
function createAutarkProvenance(options: CreateAutarkProvenanceOptions): AutarkProvenanceApi;
```

**Options:**

| Option         | Type                             | Description                                                                                      |
| -------------- | -------------------------------- | ------------------------------------------------------------------------------------------------ |
| `map`          | `IMapForProvenance`              | Map adapter object (see [Map Adapter](#map-adapter))                                             |
| `plots`        | `IPlotForProvenance[]`           | Plot instances to track. Each must have `plotId`, `plotType`, `plotEvents`, `setHighlightedIds`. |
| `db`           | `IDbForProvenance`               | autk-db instance to track                                                                        |
| `compute`      | `IComputeForProvenance`          | autk-compute instance to track                                                                   |
| `mapConfig`    | `MapSelectorConfig`              | Override default map UI selectors and register custom controls                                   |
| `initialState` | `Partial<AutarkProvenanceState>` | Override the initial state of the root node                                                      |

**Returns `AutarkProvenanceApi`:**

| Method                       | Description                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| `goToNode(nodeId)`           | Navigate to any node in the graph by ID. Returns `true` if successful.             |
| `goBackOneStep()`            | Move to the parent of the current node. Returns `true` if possible.                |
| `goForwardOneStep()`         | Move to the most-recently-visited child. Returns `true` if possible.               |
| `canGoBack()`                | Returns `true` if the current node has a parent.                                   |
| `canGoForward()`             | Returns `true` if the current node has children.                                   |
| `getPathFromRoot()`          | Returns the ordered list of nodes from root to current.                            |
| `getGraph()`                 | Returns the full `ProvenanceGraph` (all nodes, root ID, current ID).               |
| `getCurrentNode()`           | Returns the current `ProvenanceNode` or `null`.                                    |
| `getCurrentState()`          | Returns the current `AutarkProvenanceState` or `null`.                             |
| `exportGraph()`              | Serializes the full graph to a JSON string.                                        |
| `importGraph(json)`          | Replaces the graph from a previously exported JSON string.                         |
| `addObserver(cb)`            | Registers a callback fired on every graph change. Returns an unsubscribe function. |
| `annotateNode(nodeId, text)` | Attaches a text annotation to any node without creating a new provenance step.     |
| `startRecording()`           | Resume recording after a `stopRecording()` call.                                   |
| `stopRecording()`            | Pause all recording (interactions are ignored until `startRecording()`).           |
| `db`                         | Exposes the `DbAdapterApi` for manual DB recording operations.                     |

---

### `renderInsightsWorkspace`

Renders a fully wired analytics workspace (map + 4 charts + provenance trail + insights) into a container element.

```ts
function renderInsightsWorkspace(options: RenderInsightsWorkspaceOptions): RenderInsightsWorkspaceResult;
```

**Options:**

| Option        | Type                | Description                                      |
| ------------- | ------------------- | ------------------------------------------------ |
| `container`   | `HTMLElement`       | Root element to render the workspace into        |
| `map`         | `AutkMap`           | Map instance from autk-map                       |
| `collection`  | `FeatureCollection` | GeoJSON collection — source for all charts       |
| `layerId`     | `string`            | Layer ID already registered in the map           |
| `db`          | `IDbForProvenance`  | Optional database instance for DB provenance     |
| `title`       | `string`            | Workspace header title                           |
| `description` | `string`            | Workspace header description                     |
| `mapConfig`   | `MapSelectorConfig` | Optional map selector / custom control overrides |

**Returns:**

| Property     | Type                  | Description                                                |
| ------------ | --------------------- | ---------------------------------------------------------- |
| `provenance` | `AutarkProvenanceApi` | The live provenance API for the workspace                  |
| `schema`     | `InsightsChartSchema` | Resolved chart configuration (fields, titles, collections) |
| `destroy()`  | `() => void`          | Tears down all listeners, empties the container            |

The workspace infers chart axes automatically from the GeoJSON feature properties:

- **Scatter plot**: two highest-variance numeric fields
- **Bar chart**: most distinct categorical field vs count
- **Parallel coordinates**: up to six numeric fields
- **Histogram**: the field with the widest numeric range

---

### `renderProvenanceTrailUI`

Renders the provenance trail panel — graph preview, step list, navigation buttons, and optional insights — into any container element.

```ts
function renderProvenanceTrailUI(options: ProvenanceTrailUIOptions): () => void;
```

**Options:**

| Option              | Type                  | Default  | Description                                                         |
| ------------------- | --------------------- | -------- | ------------------------------------------------------------------- |
| `provenance`        | `AutarkProvenanceApi` | required | The provenance instance to display                                  |
| `container`         | `HTMLElement`         | required | Element to render into                                              |
| `insightsContainer` | `HTMLElement`         | —        | Separate container for the insights panel (defaults to `container`) |
| `showInsights`      | `boolean`             | `true`   | Show the collapsible insights panel                                 |
| `showBackForward`   | `boolean`             | `true`   | Show back/forward navigation buttons                                |
| `showTimestamps`    | `boolean`             | `true`   | Show timestamps on trail steps                                      |
| `showGraph`         | `boolean`             | `true`   | Show the mini graph preview                                         |
| `showPathList`      | `boolean`             | `true`   | Show the linear step trail list                                     |

Returns a **cleanup function** — call it to remove all event listeners and clear the container.

The graph preview is interactive: clicking it opens a full **graph modal** with zoom (mouse wheel or `+`/`−` buttons), pan (drag), fit-to-view, and node navigation. Clicking any node in the modal navigates to that state. Press `Escape` to close the modal.

---

### `createProvenance`

Generic provenance factory for custom state shapes not tied to Autark modules.

```ts
function createProvenance<T extends Record<string, unknown>>(options: CreateProvenanceOptions<T>): ProvenanceApi<T>;
```

**Options:**

| Option         | Type                                | Description                                                 |
| -------------- | ----------------------------------- | ----------------------------------------------------------- |
| `initialState` | `T`                                 | The initial state for the root node                         |
| `adapter`      | `ProvenanceAdapter<T>`              | Object implementing `applyState(state: T): void`            |
| `mergeState`   | `(base: T, delta: Partial<T>) => T` | Optional custom merge strategy (defaults to shallow spread) |

**Returns `ProvenanceApi<T>`** — the same navigation, graph, export/import, and observer API as `AutarkProvenanceApi`, plus `applyAction(actionType, label, delta)` for manually recording interactions.

---

### Insight Engine

The insight engine derives analytical observations from the provenance graph without modifying it.

```ts
import {
  computeSelectionFrequency,
  computeGraphMetrics,
  getInsightAnnotations,
  generateSessionNarrative,
} from 'autk-provenance';
```

#### `computeSelectionFrequency(graph)`

Returns how often each feature ID was selected across all nodes in the graph:

```ts
const freq = computeSelectionFrequency(graph);
// freq.map  — Map<featureId, count> for map selections
// freq.plots — Map<plotId, Map<featureId, count>> for plot selections
```

#### `computeGraphMetrics(graph)`

Derives structural statistics about the exploration session:

```ts
const metrics = computeGraphMetrics(graph);
// metrics.totalNodes       — total number of recorded states
// metrics.branchPoints     — nodes with more than one child
// metrics.backtracks       — total backtrack events (children beyond the first)
// metrics.maxDepth         — longest path from root to leaf
// metrics.sessionDurationMs
// metrics.avgTimePerStateMs
// metrics.branchRatio      — branchPoints / totalNodes
// metrics.strategyLabel    — 'Confirmatory' | 'Exploratory' | 'Iterative Refinement'
// metrics.insightCount     — number of annotated nodes
```

**Strategy classification:**

- **Confirmatory** — linear, focused analysis; the analyst knew what they were looking for
- **Exploratory** — multiple diverging branches; broad, open-ended investigation
- **Iterative Refinement** — high backtrack rate and branch ratio; hypothesis-driven revision

#### `getInsightAnnotations(graph)`

Returns all nodes that have a text annotation attached:

```ts
const annotations = getInsightAnnotations(graph);
// [{ nodeId, actionLabel, text, timestamp }, ...]
```

#### `generateSessionNarrative(graph, metrics, annotations)`

Produces a plain-text narrative summarizing the session:

```ts
const narrative = generateSessionNarrative(graph, metrics, annotations);
// "Session started at 14:32:01.
//  Duration: 4m 12s across 23 states (avg 11s per state).
//  Analysis strategy: Exploratory
//  ..."
```

---

## Adapters

### Map Adapter

The map adapter connects an `AutkMap` (or any object implementing `IMapForProvenance`) to the provenance system.

**What it records:**

- Map initialization (`MAP_INIT`) and layer loads (`MAP_LAYER_LOAD`)
- Feature picks / selections (`MAP_PICK`) via the `picking` event
- Camera viewport changes (`MAP_VIEW`) — debounced at 180 ms
- Hamburger menu open/close (`MAP_UI_MENU_TOGGLE`)
- Layer visibility toggles (`MAP_UI_VISIBLE_LAYER_TOGGLE`) — eye icon
- Active layer changes (`MAP_UI_ACTIVE_LAYER_CHANGE`) — cursor icon
- Thematic colormap toggles (`MAP_UI_THEMATIC_TOGGLE`) — palette icon

**What it restores on node navigation:**

- Layer visibility (`isSkip` render flag on each layer)
- Active layer (`map.ui.changeActiveLayer`)
- Thematic state (`isColorMap` render flag on each layer)
- Map menu open/closed state
- Camera viewport (`map.setViewState`)
- Feature highlight on each layer (`setHighlightedIds` / `clearHighlightedIds`)

**`IMapForProvenance` interface:**

The map object passed to `createAutarkProvenance` must satisfy:

```ts
interface IMapForProvenance {
  mapEvents: {
    addEventListener(event: string, listener: (selection: number[], layerId: string) => void): void;
    removeEventListener?(event: string, listener: ...): void;
  };
  canvas: { parentElement: HTMLElement | null };
  layerManager: {
    searchByLayerId(id: string): LayerLike | null;
    layers: LayerLike[];
  };
  addViewListener?(cb: (state: MapViewState) => void): void;
  removeViewListener?(cb: (state: MapViewState) => void): void;
  setViewState?(state: MapViewState): void;
  ui?: {
    activeLayer?: { layerInfo?: { id: string }; layerRenderInfo?: { isColorMap?: boolean } } | null;
    changeActiveLayer?(layer: unknown): void;
    refreshLayerList?(): void;
  };
  updateRenderInfo?(layerName: string, params: unknown): void;
  updateRenderInfoProperty?(layerName: string, property: string, value: unknown): void;
}
```

When using `renderInsightsWorkspace` or `createAutarkProvenance` with a real `AutkMap`, this wrapper is assembled automatically in the workspace layer.

---

### Plot Adapter

The plot adapter connects one or more interactive plots to the provenance system.

**What it records:**

- Click-based selections (`PLOT_CLICK`) — individual point or bar clicks
- 2D brush selections (`PLOT_BRUSH`) — rectangular lasso in scatter plots
- 1D horizontal brush (`PLOT_BRUSH_X`)
- 1D vertical brush (`PLOT_BRUSH_Y`) — used in parallel coordinates
- Data updates (`PLOT_DATA`) — when a plot's data collection is replaced

**Cross-view deduplication:** The plot adapter separates each plot's **owned selection** (IDs the user explicitly selected in that plot) from **borrowed IDs** (IDs highlighted because of another plot or map selection). Only owned selections are stored per plot in the provenance state. On restoration, all owned IDs across all sources are unioned and applied as highlights to every plot simultaneously.

**`IPlotForProvenance` interface:**

```ts
interface IPlotForProvenance {
  plotId: string; // Stable unique identifier, used as the state key
  plotType: PlotType; // SCATTERPLOT | BARCHART | PARALLEL_COORDINATES | HISTOGRAM
  plotEvents: {
    addEventListener(event: string, listener: (selection: number[]) => void): void;
    removeEventListener?(event: string, listener: (selection: number[]) => void): void;
  };
  setOwnedSelection(ids: number[]): void;
  setHighlightedIds(ids: number[]): void; // Apply coordinated highlight
}
```

`PlotType` values: `PlotType.SCATTERPLOT`, `PlotType.BARCHART`, `PlotType.PARALLEL_COORDINATES`, `PlotType.HISTOGRAM`.

---

### DB Adapter

The DB adapter connects an `autk-db` database instance to provenance. It records data-loading and transformation operations, and restores the workspace and active layer state on node navigation.

**What it records:**

| Action                                                          | Trigger                 |
| --------------------------------------------------------------- | ----------------------- |
| `DB_INIT`                                                       | Database initialization |
| `DB_WORKSPACE`                                                  | Workspace open          |
| `DB_LOAD_OSM`                                                   | OpenStreetMap data load |
| `DB_LOAD_CSV` / `DB_LOAD_JSON`                                  | CSV or JSON file import |
| `DB_LOAD_LAYER` / `DB_LOAD_CUSTOM_LAYER` / `DB_LOAD_GRID_LAYER` | Layer loads             |
| `DB_GET_LAYER`                                                  | Layer retrieval         |
| `DB_SPATIAL_JOIN`                                               | Spatial join operation  |
| `DB_UPDATE_TABLE` / `DB_DROP_TABLE`                             | Table mutations         |
| `DB_RAW_QUERY`                                                  | Arbitrary SQL execution |
| `DB_BUILD_HEATMAP`                                              | Heatmap construction    |

The DB adapter also exposes a `db` property on `AutarkProvenanceApi` for manual recording calls when automatic wrapping is insufficient.

---

### Compute Adapter

The compute adapter wraps `autk-compute`'s `GeojsonCompute` instance and records GPU computation runs.

**What it records:**

- `COMPUTE_RUN` — fires after `computeFunctionIntoProperties` resolves, storing the output column name, feature count, and timestamp in `state.filters.lastCompute`.

---

## Custom Controls

Custom controls allow tracking of arbitrary DOM elements (dropdowns, toggle buttons, sliders, date pickers) that live in or near the map container.

```ts
const mapConfig: MapSelectorConfig = {
  customControls: [
    {
      selector: '#month-dropdown',
      event: 'change',
      actionType: 'FILTER_MONTH',
      getLabel: (el) => `Month: ${(el as HTMLSelectElement).value}`,
      getStateDelta: (el) => ({
        filters: { selectedMonth: (el as HTMLSelectElement).value },
      }),
      applyState: (el, state) => {
        (el as HTMLSelectElement).value = (state.filters?.selectedMonth as string) ?? '';
      },
    },
    {
      selector: '#reset-button',
      event: 'click',
      actionType: 'RESET_FILTERS',
      getLabel: () => 'Reset all filters',
      getStateDelta: () => ({ filters: {} }),
    },
  ],
};

const provenance = createAutarkProvenance({ map, plots, mapConfig });
```

Each custom control config:

- `selector` — CSS selector to match the control element
- `event` — `'click'` or `'change'`
- `actionType` — the provenance action label stored on the node
- `getLabel(el)` — human-readable description shown in the trail
- `getStateDelta(el)` — returns the state slice to record
- `applyState(el, state)` — optional: restores the control's DOM state on node navigation

---

## Tracked Interactions

The following actions are defined in `ProvenanceAction` and each creates one node in the provenance graph:

| Action                                                          | Description                                          |
| --------------------------------------------------------------- | ---------------------------------------------------- |
| `ROOT`                                                          | Initial state node, created automatically on startup |
| `MAP_INIT`                                                      | Map canvas initialized                               |
| `MAP_LAYER_LOAD`                                                | A GeoJSON or raster layer was loaded                 |
| `MAP_PICK`                                                      | User picked features on the map                      |
| `MAP_VIEW`                                                      | Camera viewport changed (debounced)                  |
| `MAP_UI_MENU_TOGGLE`                                            | Hamburger menu opened or closed                      |
| `MAP_UI_VISIBLE_LAYER_TOGGLE`                                   | Eye icon toggled a layer's visibility                |
| `MAP_UI_ACTIVE_LAYER_CHANGE`                                    | Cursor icon changed the active picking layer         |
| `MAP_UI_THEMATIC_TOGGLE`                                        | Palette icon toggled thematic colormap               |
| `MAP_UI_CUSTOM_CONTROL`                                         | A registered custom control was interacted with      |
| `PLOT_CLICK`                                                    | User clicked a mark in a plot                        |
| `PLOT_BRUSH`                                                    | 2D brush selection in scatter plot                   |
| `PLOT_BRUSH_X`                                                  | Horizontal brush selection                           |
| `PLOT_BRUSH_Y`                                                  | Vertical brush (parallel coordinates)                |
| `PLOT_DATA`                                                     | A plot's data collection was replaced                |
| `PLOT_ADD` / `PLOT_REMOVE`                                      | Plot added or removed dynamically                    |
| `COMPUTE_RUN`                                                   | GPU computation completed                            |
| `DB_INIT`                                                       | Database initialized                                 |
| `DB_WORKSPACE`                                                  | Workspace opened                                     |
| `DB_LOAD_OSM`                                                   | OSM data loaded                                      |
| `DB_LOAD_CSV` / `DB_LOAD_JSON`                                  | CSV or JSON imported                                 |
| `DB_LOAD_LAYER` / `DB_LOAD_CUSTOM_LAYER` / `DB_LOAD_GRID_LAYER` | Layer loaded                                         |
| `DB_GET_LAYER`                                                  | Layer retrieved from DB                              |
| `DB_SPATIAL_JOIN`                                               | Spatial join performed                               |
| `DB_UPDATE_TABLE` / `DB_DROP_TABLE`                             | Table modified or dropped                            |
| `DB_RAW_QUERY`                                                  | Raw SQL query executed                               |
| `DB_BUILD_HEATMAP`                                              | Heatmap built                                        |

---

## Session Insights

The workspace includes a **session insights panel** that surfaces:

- **Annotate This Step** — a free-text input to attach a note to the current node
- **Analysis Summary** — a generated narrative describing the session, strategy, top selections, and all annotations

Annotations are attached to nodes with `provenance.annotateNode(nodeId, text)` without creating a new provenance step.

---

## Export and Import

The full provenance graph can be serialized and restored:

```ts
// Export
const json = provenance.exportGraph();
localStorage.setItem('session', json);

// Import (replaces current graph)
const json = localStorage.getItem('session');
provenance.importGraph(json);
```

The exported JSON contains all nodes, the root ID, the current node ID, and all state snapshots. Imported graphs trigger state restoration to the previously-current node.

---

## Building

```bash
# From project root — builds leaf packages first, then autk-provenance
make build

# Build only autk-provenance (autk-plot must already be built)
cd autk-provenance && npm run build

# Type-check without emitting
cd autk-provenance && npx tsc --noEmit --skipLibCheck
```

> **Build order note:** `autk-provenance` imports `autk-plot` at build time. Always build `autk-plot` before `autk-provenance`. The root `Makefile` enforces this order automatically.

---

## Development Workflow

### Start the full dev server

```bash
make dev
```

Builds and watches all modules (`autk-map`, `autk-db`, `autk-plot`, `autk-compute`, `autk-provenance`) and starts the gallery Vite server at `http://localhost:5173`.

### Open the provenance workspace example

```
http://localhost:5173/src/autk-provenance/all-plots-provenance.html
```

### Inspect state from the browser console

```ts
// Temporarily expose in your page script for debugging
(window as any).__provenance = provenance;
```

Then in DevTools:

```js
__provenance.getCurrentState();
__provenance.getGraph();
__provenance.exportGraph();
```

### Manual test checklist

**Startup and data load:**

- Reload the page — confirm early trail entries for map initialization and layer loading
- Confirm the root `Start` node appears in the graph

**Branch navigation:**

1. Pick a map feature → confirm a `MAP_PICK` node appears
2. Navigate back to the root
3. Brush the scatter plot → confirm a `PLOT_BRUSH` node appears on a new branch
4. Open the graph modal — confirm visible branching structure
5. Click nodes from both branches — confirm state replay for each

**Hamburger menu tracking:**

1. Open the menu (confirm `MAP_UI_MENU_TOGGLE`)
2. Click the eye icon to hide a layer (confirm `MAP_UI_VISIBLE_LAYER_TOGGLE`)
3. Click the palette icon to enable thematic (confirm `MAP_UI_THEMATIC_TOGGLE`)
4. Click the cursor icon to change active layer (confirm `MAP_UI_ACTIVE_LAYER_CHANGE`)
5. Navigate back to before the toggles — confirm layers restore correctly

**Cross-view consistency:**

1. Pick a map feature → all chart highlights update
2. Click a scatter plot dot → map and other charts highlight
3. Navigate back → all views revert

**Deduplication:**

- Clear a selection, then immediately clear again — only one clear node should be created
- Pan the map slowly — view should debounce and produce a single `MAP_VIEW` node per gesture

**Annotations:**

1. Navigate to a node of interest
2. Enter text in the "Annotate This Step" field
3. Confirm the annotation appears in the Analysis Summary
