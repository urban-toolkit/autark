<div align="center">
  <img src="./logo.png" alt="Autark Logo" height="150"/></br>

  <h1>Autark</h1>

  <br>
  <p><strong>A serverless, modular toolkit to streamline the prototyping of urban visual analytics systems.</strong></p>

  <p>
    <a href="https://arxiv.org/abs/2604.20759">Paper</a> ·
    <a href="https://autarkjs.org/">Website</a>
  </p>  
</div>
<br>

Autark provides a client-side platform for implementing urban visual analytics software. It supports loading, storing, querying, joining, and exporting physical and thematic urban data using standard formats such as OpenStreetMap, GeoJSON, and GeoTIFF. By using GPU acceleration, Autark enables the implementation of algorithms for sophisticated urban analyses, such as shadow and visibility analysis, as well as classic machine learning algorithms such as regression and clustering. Finally, it provides a collection of interactive plots and a 3D map for visualizing urban data.

Autark is available as a single package or as individual modules:

* `@urban-toolkit/autk`: Complete package that re-exports the toolkit modules.
* `@urban-toolkit/autk-db`: A spatial database that handles physical and thematic urban datasets.
* `@urban-toolkit/autk-compute`: A WebGPU-based computation engine for implementing general-purpose algorithms using physical and thematic data.
* `@urban-toolkit/autk-map`: A WebGPU-based vector map visualization library for exploring 2D and 3D physical and thematic layers.
* `@urban-toolkit/autk-plot`: A D3.js-based plot library designed to consume urban data in standard formats and facilitate linked views.

For demonstration and documentation purposes, we created a large collection of examples illustrating the core functionality of each module in the `example/` directory. We also provide more complex examples in the `usecases/` folder.

## Installation

Autark packages are available on npm. Install the complete package when you want the full toolkit:

```bash
npm install @urban-toolkit/autk
```

Or install individual modules when you only need part of the toolkit:

```bash
npm install @urban-toolkit/autk-db
npm install @urban-toolkit/autk-compute
npm install @urban-toolkit/autk-plot
npm install @urban-toolkit/autk-map
```

## Development

### Dependencies

You need Node.js installed to build and run this project for development purposes. Please check the [Node.js website](https://nodejs.org/) for instructions.

We also use GNU Make to automate the build process. To install it, please use one of the following commands (we recommend using the package manager [Chocolatey](https://chocolatey.org/) on Windows):

```bash
# Windows
choco install make

# macOS
xcode-select --install

# Debian/Ubuntu
sudo apt-get install build-essential
```

### Building and Running

After installing Node.js and GNU Make, run the following command from the project's root folder:

```bash
make dev
```

This command starts a development server for the default `gallery` examples folder. You can specify a different examples folder using the `APP` variable and a specific file using `OPEN`:

```bash
# Run the gallery with a specific example
make dev APP=gallery OPEN=/src/autk-plot/map-d3-table.html

# Run the usecases workspace (case studies)
make dev APP=usecases OPEN=/src/urbane/main.html
```

### Testing

Autark uses [Playwright](https://playwright.dev/) for end-to-end visual regression testing. Tests are organized under `tests/<app>/` and compare screenshots against committed reference images.

To run the stable test suite:

```bash
make test
```

To run a specific test:

```bash
make test TEST=tests/gallery/autk-map/standalone-geojson-vis.test.ts
```

To update the visual baselines:

```bash
# Update screenshots only
make test-update TEST=tests/gallery/autk-map/colormap-categorical.test.ts UPDATE="images"
```

Tests that load OpenStreetMap data use HAR files under `tests/data/` to replay Overpass API responses without hitting the network. Include `cache` in `UPDATE` to re-record them when the query or area changes.

```bash
# Update HAR cache and screenshots
make test-update TEST=tests/gallery/autk-map/osm-layers-api.test.ts UPDATE="cache images"
```

### Development Workflow

The `Makefile` provides several commands to help with the development process:

| Command | Description |
| :--- | :--- |
| `make lint` | Runs ESLint. |
| `make typecheck` | Builds package outputs, then typechecks all workspaces. |
| `make build` | Builds the publishable packages and the `autk` umbrella package. |
| `make verify` | Runs lint and typecheck (including the build required for type resolution). |
| `make docs` | Generates TypeDoc documentation for the core libraries. |
| `make test` | Runs the stable Playwright tests used by CI. |
| `make test-update` | Updates local Playwright screenshots and/or HAR files for a selected test. |
| `make clean` | Removes `node_modules` and build artifacts. |

## Notes

Autark requires WebGPU. Please make sure it is enabled in your browser. In Chrome or Edge (v113+), it is enabled by default. In Firefox, WebGPU is only available in Nightly builds and must be explicitly enabled:

  1. Download and install [Firefox Nightly](https://www.mozilla.org/en-US/firefox/channel/desktop/#nightly).
  2. Visit `about:config`.
  3. Set `dom.webgpu.enabled` to `true`.
  4. (Optional) You may also need to enable `gfx.webgpu.enabled` and `gfx.webgpu.force-enabled`.
  5. Restart Firefox.
