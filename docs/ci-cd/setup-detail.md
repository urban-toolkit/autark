# CI/CD Setup Details

## CI

`.github/workflows/ci.yml` runs on PRs to `main` and pushes to `main`.

Steps:

1. Install dependencies with `npm install` because `package-lock.json` is ignored in this repo.
2. Install Playwright Chromium with `npx playwright install chromium`.
3. Run `make lint`.
4. Run `make typecheck` (this builds package outputs first so workspace package types resolve on fresh CI runners).
5. Run `make test`.
7. Upload Playwright reports/results as artifacts.

`make test` intentionally runs only one test by default:

```bash
tests/gallery/autk-map/colormap-categorical.test.ts
```

This keeps CI conservative while the rest of the visual regression suite is stabilized.

## Screenshots and HAR files

CI validates already-committed baselines. It does not create new screenshots or HAR files.

Use local commands to update baselines, then commit the generated files:

```bash
make test-update TEST=tests/gallery/autk-map/colormap-categorical.test.ts UPDATE=images
make test-update TEST=tests/gallery/autk-map/osm-layers-api.test.ts UPDATE="cache images"
```

For tests that call Overpass, including `cache` in `UPDATE` sets `HAR_UPDATE=1`, and the helper in `tests/helpers/route-overpass-har.ts` records successful responses into `.har` files.

## Publishing

`.github/workflows/publish.yml` runs after the `CI` workflow succeeds on `main`.

For each package:

- reads `package.json` version
- checks `npm view <package>@<version> version`
- skips if that version already exists
- publishes with `npm publish ./<package> --access public --provenance` if missing
- creates a git tag `<package>@<version>` if missing

Published packages:

- `autk-map`
- `autk-db`
- `autk-plot`
- `autk-compute`
- `autk`

Required secret:

- `NPM_TOKEN`

## Umbrella package

The new `autk` package re-exports all packages as namespaces:

```ts
import { map, db, compute, plot } from 'autk';
```

It also supports subpath imports:

```ts
import { SomeMapExport } from 'autk/map';
import { SomeDbExport } from 'autk/db';
import { SomeComputeExport } from 'autk/compute';
import { SomePlotExport } from 'autk/plot';
```
