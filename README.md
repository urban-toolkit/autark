# Autark: A Serverless Toolkit for Prototyping Urban Visual Analytics Systems
<div align="center">
  <img src="./logo.png" alt="Autark Logo" height="200"/></br>
</div>
<br>

**Autark** is a modular and serverless toolkit built in TypeScript to streamline the implementation and deployment of urban visual analytics systems. 

It provides a client-side platform for the complete implementation of urban visual analytics systems. It supports loading, storing, querying, joining, and exporting both physical and thematic urban data using standard formats like OpenStreetMap, GeoJSON, and GeoTIFF. Employing GPU acceleration, it allows for fast implementations of urban analysis algorithms. Finally, it provides a collection of interactive plots and a 3D map for visualizing urban data.

Autark is composed of four modules:

* `autk-db`: A spatial database that handles physical and thematic urban datasets.
* `autk-compute`: a WebGPU based general-purpose computation engine to implement general-purpose algorithms using physical and thematic data.
* `autk-map`: A map visualization library that allows the exploration of 2D and 3D physical and thematical layers.
* `autk-plot`: A d3.js based plot library designed to consume urban data in standard formats and create linked views.

For demonstration purposes and to facilitate the adoption of Autark, we created a large collection of simple examples illustrating the core functionalities of each module. We also provide several examples on how to combine several modules to build complex applications. All examples are organized in the `example/` directory.

## Installation

Autark modules are available on NPM. The modules must be installed individually and can be used independently. To install each module, run:

```bash
# autk-bd
npm install -save autk-db

# autk-compute
npm install -save autk-compute

# autk-plot
npm install -save autk-plot

# autk-map
npm install -save autk-map
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

After installing Node.js and GNU Make, in the root folder of the project, run the following command to install required packages:

```bash
make install
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

Autark uses [Playwright](https://playwright.dev/) for end-to-end visual regression testing. Tests are organized under `tests/<app>/` and capture screenshots of the canvas output, which are compared against saved reference images.

All test commands accept two parameters: `APP` (the application workspace, e.g. `gallery` or `usecases`) and `OPEN` (the path to the example within the app).

```bash
# Run tests and compare against saved reference screenshots
make test APP=gallery OPEN=/src/autk-map/standalone-geojson-vis.html

# Save new reference screenshots (run this when visual output changes intentionally)
make test-update APP=gallery OPEN=/src/autk-map/standalone-geojson-vis.html

# Open the Playwright UI for interactive test debugging
make test-ui APP=gallery OPEN=/src/autk-map/standalone-geojson-vis.html

# Record a new test by interacting with an example in the browser
# Interactions are saved as a test file under tests/<app>/
make test-codegen APP=gallery OPEN=/src/autk-map/standalone-geojson-vis.html
```


### Development Workflow

The `Makefile` provides several commands to help with the development process:

| Command | Description |
| :--- | :--- |
| `make install` | Installs all dependencies for the workspace. |
| `make build` | Builds the core libraries (`autk-map`, `autk-db`, etc.). |
| `make verify` | Runs the full CI suite: lint, typecheck, build-all, docs, and tests. |
| `make docs` | Generates TypeDoc documentation for the core libraries. |
| `make clean` | Removes `node_modules` and all build artifacts. |

#### Component-Specific Builds
If you are working on a specific module, you can rebuild it individually:
```bash
make map      # Build autk-map
make db       # Build autk-db
make plot     # Build autk-plot
make compute  # Build autk-compute
```

## Notes

Autark requires WebGPU. Please make sure to have it enabled in your browser. In Chrome or Edge (v113+), it's enabled by default. In Firefox, WebGPU is only available in Nightly builds and must be explicitly enabled:

  1. Download and install [Firefox Nightly](https://www.mozilla.org/en-US/firefox/channel/desktop/#nightly).
  2. Visit `about:config`.
  3. Set `dom.webgpu.enabled` to `true`.
  4. (Optional) You may also need to enable `gfx.webgpu.enabled` and `gfx.webgpu.force-enabled`.
  5. Restart Firefox.
