# autk-plot: Data Visualization Library

<div align="center">
  <img src="https://raw.githubusercontent.com/urban-toolkit/utk-serverless/main/logo.png" alt="Autark Logo" height="200"/></br>
</div>
<br>

**autk-plot** is a data visualization library, part of the Autark ecosystem, built on top of D3. The library can be used standalone or in conjunction with other Autark modules. To facilitate adoption, we provide a large collection of examples in the [Autark website](https://autarkjs.org/gallery/), demonstrating its functionality both as an independent library and as part of the larger ecosystem of tools for urban data analytics.

## Resources

- [Documentation](https://autarkjs.org/introduction.html)
- [Examples](https://autarkjs.org/gallery/)
- [Use Cases](https://autarkjs.org/usecases/)

## Transformation Architecture

`autk-plot` exposes a shared transformation layer under `src/transforms/`:

- `kernel.ts`: low-level primitives such as bucket reduction and provenance-safe `autkIds` merging.
- `presets/*.ts`: preset runners for the supported chart workflows.
- `index.ts`: the public transform entrypoint that re-exports helpers and the top-level `run(...)` dispatcher.

The invariant is:

- Every transformed output row must carry `autkIds`, always referencing source feature indices from the original `FeatureCollection`.

### Importing

```ts
import {
  run,
  reduceBuckets,
  type ChartTransformConfig,
  type TransformResolution,
  type TransformReducer,
} from 'autk-plot';
```

Supported built-in presets:

- `binning-1d`
- `binning-2d`
- `binning-events`
- `reduce-series`
- `sort`

### Example: Run a Binning Events Transform

```ts
const rows = collection.features.map((f, idx) => ({
  ...(f.properties ?? {}),
  autkIds: [idx],
}));

const config: ChartTransformConfig = {
  preset: 'binning-events',
  options: {
    resolution: 'month',
    reducer: 'count',
    timestamp: 'timestamp',
    value: 'value',
  },
};

const byMonth = run(rows, config, ['events', '@transform']);
```

### Example: Run a Reduce Series Transform

```ts
const aggregated = run(
  rows,
  {
    preset: 'reduce-series',
    options: { timestamp: 'year', value: 'population', reducer: 'avg' },
  },
  ['populationSeries', '@transform']
);
```

### Example: Use `reduceBuckets` Directly

```ts
const buckets = reduceBuckets({
  rows,
  bucketOf: (row) => String(row.category ?? 'unknown'),
  valueOf: (row) => Number(row.value ?? 0),
  reducer: 'sum',
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
