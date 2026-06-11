#!/usr/bin/env python3
"""
Example demonstrating GeoTIFF raster data loading with Autark.
"""

import autark as ak

def main():
    # Create a spec with GeoTIFF data source
    spec = ak.Spec(
        metadata=ak.Metadata(
            title="GeoTIFF Raster Visualization",
            description="Loading and visualizing GeoTIFF raster data"
        ),
        workspace=ak.Workspace(name="raster_demo")
    )

    # Add GeoTIFF data source
    # This would typically point to a real GeoTIFF file
    geotiff_data = ak.GeoTIFF(
        name="elevation",
        url="https://example.com/data/elevation.tif",
        band=1  # Use the first band
    )
    spec.add_data(geotiff_data)

    # Create a map view with raster layer
    map_view = ak.Map(
        id="elevation_map",
        title="Elevation Map"
    )

    # Add raster layer
    # Note: The exact raster layer API may need adjustment based on runtime support
    raster_layer = ak.RasterLayer(
        id="elevation_layer",
        source="elevation",
        encoding={
            "color": {
                "field": "value",
                "scale": {
                    "domain": [0, 1000],  # Elevation range in meters
                    "range": ["green", "brown", "white"]  # Valley to peak colors
                }
            }
        }
    )
    map_view.add_layer(raster_layer)

    # Set viewport
    map_view.set_viewport(
        center=[-74.0, 40.7],
        zoom=10
    )

    spec.add_view(map_view)

    # Save the spec
    spec.save_json("geotiff_raster_example.json")
    print("Saved geotiff_raster_example.json")

    # For Jupyter notebooks, display the spec
    # return spec

if __name__ == "__main__":
    main()