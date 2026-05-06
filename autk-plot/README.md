# @urban-toolkit/autk-plot

<div align="center">
  <img src="../logo.png" alt="Autark Logo" height="200"/></br>
</div>
<br>

## Autark toolkit

**Autark** is a serverless, modular TypeScript toolkit for prototyping urban visual analytics systems entirely in the browser. It supports client-side workflows for loading, storing, querying, joining, computing, and visualizing physical and thematic urban data using standard formats such as OpenStreetMap, GeoJSON, GeoTIFF, and CSV.

The toolkit is available as the umbrella package `@urban-toolkit/autk` or as individual modules:

* `@urban-toolkit/autk-db`: In-browser spatial database for urban datasets.
* `@urban-toolkit/autk-compute`: WebGPU computation engine for analytical and render-based pipelines.
* `@urban-toolkit/autk-map`: WebGPU 2D/3D map visualization library.
* `@urban-toolkit/autk-plot`: D3.js-based plotting library for linked urban data views.

## Plot visualization

`@urban-toolkit/autk-plot` is a D3.js-based plotting library for visualizing GeoJSON feature properties. It provides a unified `AutkPlot` wrapper for multiple chart types, shared styling and colormap utilities, interaction events, selections, data updates, and transform presets for common aggregation workflows.

### Basic usage

```ts
import { AutkPlot, PlotEvent } from '@urban-toolkit/autk-plot';

const container = document.querySelector<HTMLElement>('#plot')!;

const plot = new AutkPlot(container, {
  type: 'scatterplot',
  collection: pointsGeojson,
  attributes: { axis: ['population', 'income'], color: 'zone' },
  labels: { axis: ['Population', 'Income'], title: 'Urban indicators' },
  events: [PlotEvent.CLICK],
});

plot.events.on(PlotEvent.CLICK, ({ selection }) => {
  console.log(selection);
});

plot.setSelection([0, 4, 10]);
```

### API summary

* `new AutkPlot(container, config)`: Creates a plot using the selected `type`.
* `type`: Returns the active plot type.
* `instance`: Exposes the underlying plot implementation for advanced use.
* `selection`: Returns selected source feature ids.
* `events`: Typed event bus for click, brush, and other supported plot events.
* `setSelection(selection)`: Applies a selection by source feature ids.
* `updateCollection(collection)`: Replaces the source GeoJSON collection and redraws.
* `draw()`: Redraws the plot synchronously.

### Supported plot types

* `scatterplot`
* `barchart`
* `parallel-coordinates`
* `table`
* `linechart`
* `heatmatrix`

### Transform API summary

`@urban-toolkit/autk-plot` also exports a shared transform layer for preparing plot data while preserving source-feature provenance through `autkIds`.

* `run(rows, config, channels)`: Runs a built-in transform preset.
* `reduceBuckets(params)`: Applies low-level bucket aggregation.
* Transform presets: `binning-1d`, `binning-2d`, `binning-events`, `reduce-series`, and `sort`.
* Reducers: `count`, `sum`, `avg`, `min`, and `max`.
* Time resolutions: `hour`, `day`, `weekday`, `monthday`, `month`, and `year`.

## Resources

- [Documentation](https://autarkjs.org/introduction.html)
- [Examples](https://autarkjs.org/gallery/)
- [Use Cases](https://autarkjs.org/usecases/)
