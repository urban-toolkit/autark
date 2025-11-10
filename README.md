# Autark: A modular urban toolkit for data visualization on the web

<div align="center">
  <img src="./logo.png" alt="Autark Logo" height="200"/></br>
</div>
<br>

**Autark** is a modular and serverless toolkit built in TypeScript to streamline the implementation and deployment of urban visual analytics systems. 

It provides a client-side platform for the complete implementation of urban visual analytics systems. It supports loading, storing, querying, joining, and exporting both physical and thematic urban data using standard formats like OpenStreetMap, GeoJSON, and GeoTIFF. Employing GPU acceleration, it allows for fast implementations of urban analysis algorithms. Finally, it provides a collection of interactive plots and a 3D map for visualizing urban data.

Autark is composed of four modules:

* `autk-db`: A spatial database that handles physical and thematic urban datasets.
* `autk-compute`: A module that enables the use of WebGPU to implement general-purpose algorithms using physical and thematic data.
* `autk-map`: A map visualization library allows the exploration of 2D and 3D physical and thematical layers.
* `autk-plot`: A d3.js based plot library designed to consume thematic urban data visualizations and facilitate the creation of linked views.

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

After istalling Node,js and GNU Make, in the root folder of the project, run the following command to install required packages:

```bash
make install
```

After installing the required packages, run the following command to start the development server:

```bash
make dev
```
There are several examples in the `example/` directory that can be loaded to test Autark. To open an example different from the default, you can either change the address in the browser or update the `server.open` attribute in the `examples/vite.config.ts` file. If you decide to edit the Vite file, you must run `make dev` again.

## Notes

Autark requires WebGPU. Please make sure to have it enabled in your browser. In Chrome or Edge (v113+), it's enabled by default. In Firefox, WebGPU is only available in Nightly builds and must be explicitly enabled:

  1. Download and install [Firefox Nightly](https://www.mozilla.org/en-US/firefox/channel/desktop/#nightly).
  2. Visit `about:config`.
  3. Set `dom.webgpu.enabled` to `true`.
  4. (Optional) You may also need to enable `gfx.webgpu.enabled` and `gfx.webgpu.force-enabled`.
  5. Restart Firefox.
