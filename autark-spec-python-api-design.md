# AutarkSpec And Python API Design

This file is retained as a historical design note. The active, consolidated
documentation is now:

- `PYTHON_API.md`

The original design sketch became stale after the MVP implementation landed. It
mixed proposed interfaces, open questions, runtime responsibilities, roadmap
items, and examples that are now either implemented or tracked elsewhere.

## Decisions That Carried Forward

- Python authors structured specs; the browser runtime executes them.
- Specs serialize to AutarkSpec JSON and validate against the shared schema.
- Python uses object composition rather than fluent global builders.
- Data sources, transforms, views, selections, and links are first-class Python
  objects.
- Python object references serialize to source or target names.
- Runtime-backed views now include map, histogram, scatterplot, and table.
- Runtime-backed transforms now include spatial join, heatmap, GPGPU compute,
  and render compute.
- Notebook display is supported through HTML export and a bundled anywidget.

## Current References

- Built API and usage examples: `PYTHON_API.md`
- Python package quick start: `python/README.md`
- Example scripts: `python/examples/README.md`
- Implementation status: `PYTHON_API_IMPLEMENTATION.md`
- Runtime schema: `schema/autark-spec-v0.1.json`
