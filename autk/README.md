# @urban-toolkit/autk

Umbrella package for the Autark toolkit.

Install `@urban-toolkit/autk` when you want the full toolkit from one package:

```bash
npm install @urban-toolkit/autk
```

Use namespace imports for the full package surface:

```ts
import { map, db, compute, plot } from '@urban-toolkit/autk';
```

Or import one module through a subpath:

```ts
import { AutkMap } from '@urban-toolkit/autk/map';
import { SpatialDb } from '@urban-toolkit/autk/db';
import { AutkPlot, PlotEvent } from '@urban-toolkit/autk/plot';
```

If you only need part of the toolkit, install the individual packages instead:

```bash
npm install autk-map
npm install autk-db
npm install autk-compute
npm install autk-plot
```
