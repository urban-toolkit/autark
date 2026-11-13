# Elevation validation samples

`elevation-regions.json` contains unmodified elevation patches decoded from publicly accessible Mapzen Terrain Tiles on AWS on November 12, 2026. Each patch records its zoom, tile address, pixel bounds, source URL, and the SHA-256 of the complete source PNG. Values use the documented Terrarium formula and are in meters. Pixels outside the stored patches are missing in the test lookup; they are never treated as measured zero elevations.

The cases cover the Rio coastline, the Alps, the Grand Canyon, the Netherlands, the Dead Sea, the North Pacific, and the Sahara. Real samples complement controlled tests with injected errors, cliffs, ridges, valleys, below-sea-level surfaces, resolution changes, missing neighbors, and tile-boundary defects. They do not establish worldwide error-detection guarantees.

The Rio fixture includes the source pixel at zoom 14, tile 6227/9266, local pixel 5/119. It decodes to -2762.078125 meters despite neighboring near-sea-level heights. Its coarser zoom-13 data provide a near-sea-level reference. The same generic settings used for every other region repair this sample.

Source and license references:

- [Terrain Tiles on AWS](https://registry.opendata.aws/terrain-tiles/)
- [Mapzen/Terrain Tiles attribution and underlying data licenses](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)
- [Terrarium format](https://github.com/tilezen/joerd/blob/master/docs/formats.md#terrarium)
