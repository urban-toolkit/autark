# UTK Serverless

This repository contains a serverless map visualizer, implemented in TypeScript/JavaScript for lightweight client-side execution with built-in access to geometry data for exploring spatial features directly in the browser. It consists of the following sub-projects:

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
```

To install all required dependencies:

```bash
make install
```

This command will install dependencies for `utkmap`.

### Running and Building

To run the development server with hot-reloading:

```bash
make dev
```

To compile the frontend for production:

```bash
make build
```

To clean build artifacts:

```bash
make clean
```

## Running and Building Manually

If you prefer not to use `make`, you can compile and deploy the project using the following steps:

### Frontend (Node.js)

To install dependencies:

```bash
cd utkmap && npm install && cd ../utkdb && npm install && cd ../demo && npm install && cd ..
```

To run the development server with hot-reloading:

```bash
npm run dev
```

To build with development settings:

```bash
cd utkmap && npm run dev-build
cd utkdb && npm run dev-build
cd demo && npm run dev
```