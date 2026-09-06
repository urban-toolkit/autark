# AGENTS.md

## Project Overview
**Autark** is a modular and serverless toolkit for urban visual analytics, built in TypeScript with WebGPU acceleration.

## Package Structure
- `@urban-toolkit/autk-core`: Shared core package used by the other Autark modules. It is developed in this monorepo as a normal workspace package and published to npm.
- `@urban-toolkit/autk-db`: Spatial database for urban datasets.
- `@urban-toolkit/autk-compute`: WebGPU-based computation engine.
- `@urban-toolkit/autk-map`: 2D/3D map visualization library.
- `@urban-toolkit/autk-plot`: D3.js based plot library.
- `@urban-toolkit/autk`: Aggregated convenience package that re-exports the published modules.

## Key Package Conventions
- Import shared core APIs from `@urban-toolkit/autk-core`, not from local symlinks or copied sources.
- Treat `@urban-toolkit/autk-core` as a first-class workspace dependency during development and as a published dependency for npm consumers.
- When changing shared core APIs, check the dependent packages (`autk-map`, `autk-db`, `autk-compute`, `autk-plot`) for type, build, and packaging impact.

## Development Commands

### Setup & Build
- `make install`: Install all dependencies.
- `make build`: Build all core libraries, including `@urban-toolkit/autk-core` first.
- `make build-all`: Build all core libraries (same as `make build`).
- `make map`: Build `autk-map`.
- `make db`: Build `autint-db`.
- `make plot`: Build `autk-plot`.
- `make compute`: Build `autk-compute`.
- `make clean`: Remove `node_modules` and build artifacts.

### Running Development Server
- `make dev`: Start dev server for the `gallery` app and watch all workspace packages, including `@urban-toolkit/autk-core`.
- `make dev APP=<app_name> OPEN=<path>`: Start dev server for a specific app and file (e.g., `make dev APP=usecases OPEN=/src/urbane/main.html`).

### Verification & Documentation
- `make lint`: Run linting.
- `make typecheck`: Run type checking across all modules.
- `make verify`: Run the CI verification suite (lint, typecheck, build).
- `make package-validate`: Build packages and validate the publishable npm artifacts.
- `make docs`: Generate TypeDoc documentation.

## Key Conventions
- **Tech Stack**: TypeScript, WebGPU, D3.js.
- **Environment**: Requires WebGPU enabled in the browser (Chrome/Edge default; Firefox Nightly requires configuration).
- **Data Formats**: OpenStreetMap, GeoJSON, GeoTIFF.

## GIT
- Never commit or push the code if I did not explicitly ask you to do that.
- Always commit the code using git best practices (https://www.conventionalcommits.org/en/v1.0.0/)
- Never reference AI tools, models, assistants, agents, or their vendors in branch names, commit messages, pull request titles or descriptions, comments, generated artifacts, or any contributor-facing text. Use neutral project terminology.
