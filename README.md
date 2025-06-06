# UTK Serverless

A serverless map visualizer, implemented in TypeScript/JavaScript for lightweight client-side execution with built-in access to OpenStreetMap geometry data for exploring spatial features directly in the browser. It consists of the following sub-projects:

* `utkdb`: Handles data management and querying.
* `utkmap`: Provides map-based visualization capabilities.

A `data/` directory is included with example datasets that can be used for testing or demonstration purposes.

## Requirements

You’ll need Node.js installed to run and build this project. You can install it via [Conda Forge](https://anaconda.org/conda-forge/nodejs), `brew`, or the [official site](https://nodejs.org). To install it with conda:

```bash
conda install -c conda-forge nodejs
```

## Installing, Running, and Building with Make

### Installation

Install Make (for running predefined build and dev commands):

```bash
# Debian/Ubuntu
sudo apt-get install build-essential

# macOS
xcode-select --install

# Windows
conda install anaconda::make
```

To install all required dependencies:

```bash
make install
```

This command will install dependencies for `utkmap`.

### Building and Running

To install required packages:

```bash
make install
```

To run the development server with hot-reloading:

```bash
make dev
```

To clean build artifacts:

```bash
make clean
```

---

## Interaction Controls

You can explore and modify the map using both keyboard and mouse:

### Keyboard Shortcuts

| Key         | Action                                                              |
|-------------|---------------------------------------------------------------------|
| `↑`         | Switch to the next map layer                                        |
| `↓`         | Switch to the previous map layer                                    |
| `t`         | Toggle thematic map rendering for the current layer                 |
| `h` / `v`   | Toggle visibility of the current layer                              |
| `s`         | Cycle through map styles (`default`, `light`, `dark`)               |


### Mouse Actions

| Action         | Effect                                                            |
|----------------|-------------------------------------------------------------------|
| Double Click   | Select object in the currently active layer (if selectable)       |


---

## Notes

* WebGPU is required to run this project. In Chrome or Edge (v113+), it's enabled by default. In Firefox, WebGPU is only available in Nightly builds and must be explicitly enabled::

  1. Download and install [Firefox Nightly](https://www.mozilla.org/en-US/firefox/channel/desktop/#nightly).
  1. Visit `about:config`.
  2. Set `dom.webgpu.enabled` to `true`.
  3. (Optional) You may also need to enable `gfx.webgpu.enabled` and `gfx.webgpu.force-enabled`.
  4. Restart Firefox.