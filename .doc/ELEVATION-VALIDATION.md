# General elevation validation

Elevation validation is a region-independent stage before height-window interpolation and terrain construction. It is enabled by default for elevation tiles and normalized raster terrain. It does not depend on imagery, location names, or a coastline mask, and it does not clamp negative heights.

## Configuration

```ts
map.loadTerrain({
    source: TERRAIN_TILE_SOURCES.awsTerrarium,
    validation: {
        minDeviation: 100, // meters
        maxSlope: 8,       // departure per meter of source sample spacing
        madMultiplier: 8, // scaled median absolute deviation
    },
});

const quality = map.getTerrainValidationStats();
// { checked, rejected, corrected, unresolved }, or null when disabled/absent
```

All sensitivity values must be finite and positive. Higher values are more conservative. `validation: false` retains raw elevations and omits quality-reference requests. The numerical APIs live in `autk-core`; map modules only adapt tile lookup, projection, fallback, and lifecycle.

## Decisions

1. Cheap spatial triage identifies large departures from neighboring samples. Ordinary samples avoid neighborhood sorting.
2. A radius-two ring supplies a robust local median and scaled median absolute deviation. The tolerance combines local variation, physical sample spacing, and the configured minimum deviation.
3. Opposing samples supporting the central value preserve coherent slopes, cliffs, narrow ridges, and valleys. An elevation below sea level is not itself evidence of an error.
4. Suspect samples are compared with coarser elevations, validated with the same rules. Coarser detail is naturally smoother: disagreement alone does not justify rejecting a feature. A coarse reference that corroborates a peak preserves it, including partial same-sided support after averaging.
5. A confirmed outlier takes a validated coarse value. If no reference exists, local median repair requires exceptionally strong support and a departure above four times the tolerance. Other numeric features remain unchanged rather than being guessed away. Incomplete neighboring-tile support can temporarily quarantine a sample and use the existing missing-data fallback until data arrive.

Both error signs are treated identically. Small clusters are assessed against their surrounding ring; broad coherent errors may escape detection. No elevation-only rule can perfectly separate every real feature from every error. Persistent datum offsets or errors shared across zooms require independent reference data.

## Tile boundaries and streaming

The tile adapter includes neighboring pixels across tile edges and corners, including longitude wrapping and latitude clamping. A six-pixel request halo supplies the local ring and parent sampling footprint. Parent references are protected from eviction even when only one render level is used. Reference readiness participates in composition signatures so arrivals trigger revalidation.

Each row-batched job uses its own frozen tile snapshot. Validation occurs before interpolation and before the resulting height texture reaches terrain, buildings, or picking. Completed windows are published atomically, and camera changes cancel obsolete jobs. Diagnostic masks are released with those jobs. `memory.validationScratch` tracks their live typed-array storage. Raw downloaded tiles and database collections are not modified.

Normalized raster terrain uses the same spatial assessment and strong local repair. It has no independent coarser reference. Samples at the outer two rows/columns are retained because a complete surrounding ring is unavailable. Static loading remains synchronous, as before.

## Diagnostics

`checked` counts visited finite input samples, `rejected` counts rejected or temporarily quarantined samples, and `corrected` counts explicit validated replacements. `unresolved` identifies decisions lacking complete supporting data, including retained unconfirmed features. Existing `missingSamples` reports actual output coverage separately. Tile totals describe published windows, not globally unique source pixels; overlapping windows may count the same location more than once.

## Verification

Controlled tests cover plains, slopes, sharp cliffs, narrow ridges and valleys, peaks corroborated at coarser scales, smooth ocean depths, below-sea-level land, isolated positive/negative errors, small clusters, missing neighbors, tile edges/corners, and invalid coarse references. They verify configuration, raw-data mode, database-input immutability, and diagnostics.

Unmodified real patches cover the Rio coast, Alps, Grand Canyon, Netherlands, Dead Sea, North Pacific, and Sahara. Their source addresses, pixel ranges, and full PNG hashes are bundled with the fixtures. The same defaults repair the Rio coastal pit while preserving the tested samples in the other regions, including negative elevations. Native WebGPU probes run the actual production terrain vertex/normal functions against raw and validated Rio windows.

These tests demonstrate supported cases and preservation behavior; they do not establish a worldwide ground-truth guarantee.

## Current validation results

The live Copacabana gallery check with imagery hidden reported 91 published-window corrections, full height coverage, and no unresolved decisions. The retained coastline still reflects the source raster resolution and bathymetry; no sea-level clipping or coastline smoothing is applied. The controlled default-gallery profile with validation enabled measured maximum callbacks of 7.9 ms during startup/tilt and 15.5 ms during panning/provider changes, with no callbacks over 50 ms. A separate run using live elevation tiles peaked at 17.5 ms during startup and 7.4 ms during the interaction phase. These are observed runs, not hardware-independent frame-time guarantees.
