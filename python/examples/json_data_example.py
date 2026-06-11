#!/usr/bin/env python3
"""
Example demonstrating JSON data source loading with Autark.
"""

import autark as ak

def main():
    # Create a spec with JSON data source
    spec = ak.Spec(
        metadata=ak.Metadata(
            title="JSON Data Example",
            description="Loading and visualizing JSON data"
        ),
        workspace=ak.Workspace(name="json_demo")
    )

    # Add JSON data from a URL
    json_url_data = ak.JSON(
        name="remote_events",
        url="https://example.com/events.json"
    )
    spec.add_data(json_url_data)

    # Add inline JSON data
    inline_data = [
        {"id": 1, "name": "Station A", "lat": 40.7128, "lon": -74.0060, "capacity": 50},
        {"id": 2, "name": "Station B", "lat": 40.7580, "lon": -73.9855, "capacity": 75},
        {"id": 3, "name": "Station C", "lat": 40.7489, "lon": -73.9680, "capacity": 60},
    ]

    json_inline_data = ak.JSON(
        name="stations",
        values=inline_data
    )
    spec.add_data(json_inline_data)

    # Create a scatter plot view
    scatter = ak.Scatterplot(
        id="station_capacity",
        title="Station Capacity",
        data="stations"
    )
    scatter.encode_x("id", title="Station ID")
    scatter.encode_y("capacity", title="Capacity")
    scatter.encode_color("name")
    spec.add_view(scatter)

    # Create a table view
    table = ak.Table(
        id="station_table",
        title="Station Data",
        data="stations",
        columns=["id", "name", "lat", "lon", "capacity"]
    )
    spec.add_view(table)

    # Set layout
    spec.set_grid_layout([
        ["station_capacity"],
        ["station_table"]
    ])

    # Save the spec
    spec.save_json("json_data_example.json")
    print("Saved json_data_example.json")

    # For Jupyter notebooks, display the spec
    # return spec

if __name__ == "__main__":
    main()