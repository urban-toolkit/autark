# Autark: A Serverless Toolkit for Prototyping Urban Visual Analytics Systems
<div align="center">
  <img src="./logo.png" alt="Autark Logo" height="200"/></br>
</div>
<br>

**Autark** is a modular and serverless toolkit built in TypeScript to streamline the implementation and deployment of urban visual analytics systems. 

It provides a client-side platform for the complete implementation of urban visual analytics systems. It supports loading, storing, querying, joining, and exporting both physical and thematic urban data using standard formats like OpenStreetMap, GeoJSON, and GeoTIFF. Employing GPU acceleration, it allows for fast implementations of urban analysis algorithms. Finally, it provides a collection of interactive plots and a 3D map for visualizing urban data.

Autark is available as an umbrella package plus individual modules:

* `@urban-toolkit/autk`: Umbrella package that re-exports the toolkit modules.
* `@urban-toolkit/autk-db`: A spatial database that handles physical and thematic urban datasets.
* `@urban-toolkit/autk-compute`: a WebGPU based general-purpose computation engine to implement general-purpose algorithms using physical and thematic data.
* `@urban-toolkit/autk-map`: A map visualization library that allows the exploration of 2D and 3D physical and thematical layers.
* `@urban-toolkit/autk-plot`: A d3.js based plot library designed to consume urban data in standard formats and create linked views.

For demonstration purposes and to facilitate the adoption of Autark, we created a large collection of simple examples illustrating the core functionalities of each module. We also provide several examples on how to combine several modules to build complex applications. All examples are organized in the `example/` directory.

## Installation

Autark packages are available on NPM. Install the umbrella package when you want the full toolkit:

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

You'll need Node.js installed to build and run this project for development purposes. Please check the [Node.js website](https://nodejs.org/) for instructions.

Also, we use GNU Make to automate the building process. To install it, please use one of the following commands (we recommend using the package manager [Chocolatey](https://chocolatey.org/) on Windows):

```bash
# Windows
choco install make

# macOS
xcode-select --install

# Debian/Ubuntu
sudo apt-get install build-essential
```

### Building and Running

After installing Node.js and GNU Make, in the root folder of the project, install dependencies:

```bash
npm install
```

To start the development server for the default `gallery` application:

```bash
make dev
```

You can specify a different application workspace using the `APP` variable and a specific file using `OPEN`:

```bash
# Run the gallery with a specific example
make dev APP=gallery OPEN=/src/autk-plot/map-d3-table.html

# Run the usecases workspace (case studies)
make dev APP=usecases OPEN=/src/urbane/main.html
```

### Testing

Autark uses [Playwright](https://playwright.dev/) for end-to-end visual regression testing. Tests are organized under `tests/<app>/` and compare screenshots against committed reference images.

CI currently runs one stable Playwright test by default:

```bash
make test
```

Run a specific test locally:

```bash
make test TEST=tests/gallery/autk-map/standalone-geojson-vis.test.ts
```

Update committed visual baselines locally:

```bash
# Update screenshots only
make test-update TEST=tests/gallery/autk-map/colormap-categorical.test.ts UPDATE=images

# Update HAR cache and screenshots
make test-update TEST=tests/gallery/autk-map/osm-layers-api.test.ts UPDATE="cache images"
```

Tests that load OpenStreetMap data use HAR files under `tests/data/` to replay Overpass API responses without hitting the network. Include `cache` in `UPDATE` to re-record them when the query or area changes.


### Development Workflow

The `Makefile` provides several commands to help with the development process:

| Command | Description |
| :--- | :--- |
| `make lint` | Runs ESLint. |
| `make typecheck` | Builds package outputs, then typechecks all workspaces. |
| `make build` | Builds the publishable packages and the `autk` umbrella package. |
| `make verify` | Runs lint and typecheck (including the build required for type resolution). |
| `make docs` | Generates TypeDoc documentation for the core libraries. |
| `make test` | Runs the stable Playwright test used by CI. |
| `make test-update` | Updates local Playwright screenshots and/or HAR files for a selected test. |
| `make clean` | Removes `node_modules` and build artifacts. |

## Notes

Autark requires WebGPU. Please make sure to have it enabled in your browser. In Chrome or Edge (v113+), it's enabled by default. In Firefox, WebGPU is only available in Nightly builds and must be explicitly enabled:

  1. Download and install [Firefox Nightly](https://www.mozilla.org/en-US/firefox/channel/desktop/#nightly).
  2. Visit `about:config`.
  3. Set `dom.webgpu.enabled` to `true`.
  4. (Optional) You may also need to enable `gfx.webgpu.enabled` and `gfx.webgpu.force-enabled`.
  5. Restart Firefox.
