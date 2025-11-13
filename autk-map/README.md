# autk-map: 3D Map Visualization Library

<div align="center">
  <img src="../logo.png" alt="Autark Logo" height="200"/></br>
</div>
<br>

**autk-map** is a 3D map visualization library built using [WebGPU](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API). The library can handle data in GeoJSON, GeoTIFF, and OBJ formats.

The library can be used standalone or in conjunction with other Autark modules. To facilitate adoption, we provide a large collection of examples in the `example/map` directory, demonstrating its functionalities both as an independent library and as part of the Autark ecosystem.

## Installation

**aut-map** is available on NPM. To install it, run:

```bash
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
