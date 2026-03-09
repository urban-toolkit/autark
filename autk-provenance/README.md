# Autark Provenance: Startup, Verification, and Testing Guide

This guide explains how to run the provenance example, verify that provenance is working in the UI, and test core provenance behavior (trail, graph navigation, and state replay).

## What This Covers

- Start the project with provenance enabled
- Open the provenance example page
- Verify that the provenance model is recording events
- Validate that going to older nodes restores full state
- Run quick build-level checks for `autk-provenance`

## Prerequisites

- Node.js installed
- Dependencies installed in workspace
- WebGPU enabled browser (Chrome/Edge recommended)

From project root:

```bash
make install
```

## Startup Options

### Option A: Full workspace (recommended)

From project root:

```bash
make dev
```

This builds and watches all modules (`autk-map`, `autk-db`, `autk-plot`, `autk-compute`, `autk-provenance`) and starts the examples Vite server.

### Option B: Faster provenance-focused workflow

Terminal 1:

```bash
cd autk-provenance
npm run dev-build
```

Terminal 2:

```bash
cd examples
npm run dev
```

## Open the Provenance UI

After the dev server starts, open:

```text
http://localhost:5173/src/autk-provenance/map-plot-provenance.html
```

Expected page sections:

- `Map View`
- `Scatterplot`
- `Provenance Trail` (right panel)
- Graph preview inside the provenance panel

## How to Check Provenance Is Working

1. Interact with map and plot:
- Click map features (pick selection)
- Brush in scatterplot
- Clear brush

2. Interact with map UI controls:
- Open/close hamburger menu
- Toggle visible layers
- Change active layer
- Toggle thematic checkbox

3. Confirm provenance updates:
- Trail list should append new entries with timestamps
- Back/Forward buttons should enable when navigation is possible
- Graph preview should show branching nodes

4. Open graph modal:
- Click graph preview (or `Open Graph`)
- Use `+`, `−`, `Fit`, wheel zoom, and drag-pan
- Click a node in modal: app should restore to that node state

## What Should Be Replayed on Node Navigation

When you click a node (trail or graph), the app should restore:

- Map selection + plot selection consistency
- Active layer
- Visible layers
- Thematic checkbox state
- Thematic legend visibility
- Menu open/closed state

If you jump to a node before thematic was enabled, thematic and legend should both be off.

## Manual Test Checklist (Recommended)

### 1. Startup + data load tracking

1. Reload page
2. Confirm early trail entries for DB/map initialization and layer loading
3. Confirm `Start` root node exists

### 2. Branch navigation

1. Do flow A: pick map feature(s)
2. Go back to earlier node
3. Do flow B: brush different scatterplot points
4. Open graph modal and confirm visible branch structure
5. Click nodes from both branches and verify state replay

### 3. Redundant clear dedupe

1. Clear plot once -> should log clear event
2. Clear again immediately (no state change) -> should NOT log extra clear
3. Make new selection, then clear -> should log clear again

### 4. Cross-view consistency

1. Select via map -> plot highlights should sync
2. Select via plot -> map highlights should sync
3. Clear plot -> map highlights should also clear

### 5. Thematic rollback

1. Enable thematic and choose properties
2. Create additional provenance steps
3. Jump to node created before thematic enable
4. Verify thematic checkbox + legend + rendering are reverted

## Build / Smoke Checks

Run provenance package build:

```bash
cd autk-provenance
npm run build
```

This validates TypeScript + bundling for `autk-provenance`.

## Optional Debug Hook (for console inspection)

If you want to inspect graph/state in browser console, temporarily expose the API in:

`examples/src/autk-provenance/map-plot-provenance.ts`

```ts
// after createAutarkProvenance(...)
(window as any).__autkProvenance = provenance;
```

Then in DevTools:

```js
__autkProvenance.getCurrentState();
__autkProvenance.getGraph();
__autkProvenance.exportGraph();
```

## Troubleshooting

- Provenance panel empty:
  - Confirm you opened `/src/autk-provenance/map-plot-provenance.html`, not another example.
- UI interactions not recorded:
  - Ensure page is using latest `autk-provenance` build/watch output.
- Node click does not restore as expected:
  - Check browser console for runtime errors.
  - Reproduce with a fresh reload and minimal sequence, then compare trail entries.

