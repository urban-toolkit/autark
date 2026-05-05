# autk

Umbrella package for the Autark toolkit.

Install `autk` when you want the full toolkit from one package:

```bash
npm install autk
```

Use namespace imports for the full package surface:

```ts
import { map, db, compute, plot } from 'autk';
```

Or import one module through a subpath:

```ts
import { AutkMap } from 'autk/map';
import { SpatialDb } from 'autk/db';
import { AutkPlot, PlotEvent } from 'autk/plot';
```

If you only need part of the toolkit, install the individual packages instead:

```bash
npm install autk-map
npm install autk-db
npm install autk-compute
npm install autk-plot
```
