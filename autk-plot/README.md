# autk-plot: Data Visualization Library

<div align="center">
  <img src="https://raw.githubusercontent.com/urban-toolkit/utk-serverless/main/logo.png" alt="Autark Logo" height="200"/></br>
</div>
<br>

**autk-plot** is a data visualization library, part of the Autark ecosystem, built on top of D3 and Vega-Lite. The library can be used standalone or in conjunction with other Autark modules. To facilitate adoption, we provide a large collection of examples in the [Autark website](https://autarkjs.org/gallery/), demonstrating its functionalities both as an independent library and as part of the larger ecosystem of tools for urban data analytics.

## Resources

- [Documentation](https://autarkjs.org/introduction.html)
- [Examples](https://autarkjs.org/gallery/)
- [Use Cases](https://autarkjs.org/usecases/)

## Transformation Architecture

`autk-plot` now exposes a shared transformation layer split into two modules:

- `transform-engine.ts`: low-level primitives (bucket reduction, reducer runtime, provenance-safe `autkIds` merging).
- `transform-presets.ts`: high-level ready-to-use transformations for common chart workflows.

The invariant is:

- Every transformed output row must carry `autkIds`, always referencing source feature indices from the original `FeatureCollection`.

### Importing

```ts
import {
  presetHistogram,
  presetEventsByResolution,
  presetTimeseriesAggregate,
  type TransformResolution,
  type TransformReducerName,
} from 'autk-plot';
```

### Example: Events by Temporal Resolution

```ts
const rows = collection.features.map((f, idx) => ({
  ...(f.properties ?? {}),
  autkIds: [idx],
}));

const byMonth = presetEventsByResolution({
  rows,
  resolution: 'month',
  reducer: 'count',
  eventsOf: (row) => Array.isArray(row.events) ? row.events : [],
  timestampOf: (event) => event?.timestamp,
});
```

### Example: Aggregate Timeseries

```ts
const aggregated = presetTimeseriesAggregate({
  rows,
  reducer: 'avg',
  pointsOf: (row) => {
    const series = Array.isArray(row.timeseries) ? row.timeseries : [];
    return series.map((value, i) => ({ timestamp: i, value: Number(value) }));
  },
});
```

### Example: Histogram

```ts
const bins = presetHistogram({
  rows,
  column: 'sjoin.avg.jun',
  numBins: 13,
});
```

Supported built-in reducers:

- `count`
- `sum`
- `avg`
- `min`
- `max`

Supported time resolutions:

- `hour`
- `day`
- `weekday`
- `monthday`
- `month`
- `year`
