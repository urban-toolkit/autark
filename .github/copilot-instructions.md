# Project Guidelines

## Scope
These instructions apply to the entire `autark` monorepo.

## Architecture
- Monorepo with npm workspaces. Core packages: `autk-core`, `autk-map`, `autk-db`, `autk-plot`, `autk-compute`.
- App/example packages: `gallery`, `usecases`, `performance`.
- Dependency direction: `autk-core` is shared foundation; other libs depend on it; apps depend on libraries.
- Keep package boundaries clear: avoid introducing cross-package imports that bypass each package public entrypoint.

## Build and Validate
Use root `Makefile` commands by default:
- `make install`: install workspace dependencies.
- `make lint`: run ESLint at repo scope.
- `make typecheck`: run TypeScript checks for all workspaces.
- `make build`: build library packages.
- `make build-all`: build libraries and app packages.
- `make verify`: lint + typecheck + build-all + docs.
- `make dev APP=gallery OPEN=/src/...`: run local example app with watched library builds.

If working in one package only, use package scripts (for example in `autk-plot`):
- `npm run build` (`tsc && vite build`)
- `npm run dev-build` (watch build)

## Conventions
- TypeScript strict mode is enabled across workspaces.
- Keep edits minimal and scoped; do not reformat unrelated files.
- Preserve existing naming patterns (`*-types.ts`, `events-*.ts`, `layer-*`, `pipeline-*`).
- Follow current export style in each package `src/index.ts` (explicit grouped exports with short section headers).

## Testing and Validation
- For new features, add relevant example flows in `gallery` or `usecases` to validate end-to-end behavior.

## Documentation
- Document the codebase with JSDoc comments (keep the level of detail consistent among all public files) and update package README files as needed.

## Git Practices
- When committing, provide clear commit messages that describe the scope and intent of the change, especially if it affects multiple packages or introduces new patterns.
- Use Git best practices: create feature branches, rebase to keep history clean, and open pull requests for review before merging to main.

## Pitfalls and Environment Notes
- No established automated test suite yet; validate with typecheck/build and relevant example flows.
- WebGPU features are required for `autk-map`/`autk-compute` workflows; browser support may affect manual validation.

## References
- Root overview and setup: `README.md`
- Build orchestration and commands: `Makefile`
- Package docs: `autk-map/README.md`, `autk-db/README.md`, `autk-plot/README.md`, `autk-compute/README.md`
