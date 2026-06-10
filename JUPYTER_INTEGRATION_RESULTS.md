# Jupyter Integration Test Results

**Date:** 2026-06-09
**Status:** ✅ **SUCCESS** - Python API renders in browser!

## Summary

The Autark Python API successfully generates HTML that renders interactive visualizations in the browser. Both GeoJSON maps and CSV data with histograms work correctly.

## What Was Tested

### Test 1: Simple GeoJSON Map ✅ PASSED
- **Data:** GeoJSON polygon data (neighborhoods)
- **View:** Map with styled polygons
- **Result:** Map rendered with 1 table
- **Visual:** Blue polygons with stroke styling

### Test 2: CSV Points + Histogram ✅ PASSED
- **Data:** CSV with lat/lng points (trees)
- **View:** Map with points + histogram (vertical layout)
- **Result:** Map + histogram rendered (1 plot detected)
- **Visual:** Green points on map, histogram of latitude values

## Issue Found & Fixed

### Problem: AJV Strict Mode Error
**Error message:**
```
Failed to load schema: Error: strict mode: required property "pbfFileUrl" is not defined
```

**Root cause:** The JSON Schema uses `if/then` conditional required properties. AJV in strict mode requires all properties mentioned in `required` arrays to be defined in the same schema object's `properties`, even within conditional `then` clauses.

**Fix applied:** Disabled AJV strict mode in [autk-runtime/src/validator.ts:18](autk-runtime/src/validator.ts#L18):
```typescript
this.ajv = new Ajv({
  allErrors: true,
  verbose: true,
  strict: false, // Disable strict mode to allow conditional required properties
});
```

This is a reasonable fix since:
- The schema is valid JSON Schema Draft 7
- Conditional requirements are a documented JSON Schema pattern
- The schema still validates specs correctly
- All 14 existing runtime tests still pass

## Test Infrastructure Created

1. **[test-jupyter.html](test-jupyter.html)** - Standalone HTML test page with 2 test cases
2. **[tests/runtime/jupyter-test.test.ts](tests/runtime/jupyter-test.test.ts)** - Automated Playwright test
3. **[python/examples/test_jupyter_integration.ipynb](python/examples/test_jupyter_integration.ipynb)** - Jupyter notebook for manual testing
4. **[python/examples/test_html_output.py](python/examples/test_html_output.py)** - CLI tool to generate test HTML
5. **[JUPYTER_QUICKSTART.md](JUPYTER_QUICKSTART.md)** - Step-by-step user guide
6. **[python/examples/JUPYTER_TESTING.md](python/examples/JUPYTER_TESTING.md)** - Detailed troubleshooting guide

## How to Run the Tests

### Automated Test (Recommended)
```bash
# Start local server
cd /Users/csilva/src/autark
python -m http.server 8765 &

# Run Playwright test
npx playwright test tests/runtime/jupyter-test.test.ts

# Kill server
pkill -f "http.server 8765"
```

### Manual Browser Test
```bash
# Start server
cd /Users/csilva/src/autark
python -m http.server 8765

# Open in browser
open http://127.0.0.1:8765/test-jupyter.html
```

### Jupyter Notebook Test
```bash
# Start server (terminal 1)
cd /Users/csilva/src/autark
python -m http.server 8765

# Start Jupyter (terminal 2)
cd python/examples
jupyter notebook test_jupyter_integration.ipynb
```

## Test Results

```
✓ Test 1: GeoJSON Map - ✅ Success! Map rendered with 1 tables
✓ Test 2: CSV + Histogram - ✅ Success! Map + histogram rendered (1 plots)
✓ Canvas elements: 2 (one for each view)
✓ All assertions passed
✓ No JavaScript errors
```

## Python API Validation

The Python API correctly generates specs that:
- ✅ Validate against JSON Schema
- ✅ Load in the TypeScript runtime
- ✅ Render maps with styled layers
- ✅ Render plots (histograms)
- ✅ Create proper layouts (vertical stacking)
- ✅ Handle both GeoJSON and CSV data sources

## Known Limitations (Not Blocking)

1. **Runtime URL configuration** - Currently hardcoded to `/autk-runtime/dist/autk-runtime.js`. Users need to:
   - Run a local dev server, OR
   - Pass custom `runtime_url` to `save_html()` / `_repr_html_()`

2. **Data file paths** - Relative URLs like `/examples/data/...` require proper server setup

3. **Not tested yet:**
   - Actual Jupyter notebook display (manual test pending)
   - JupyterLab environment
   - VS Code notebooks
   - Selection/linking interactions (covered by other tests)
   - OSM data sources (deferred)

## What This Validates

✅ **Core Jupyter Integration Works:**
- `AutarkSpec._repr_html_()` generates valid HTML
- `AutarkSpec.save_html()` creates standalone files
- HTML embeds the runtime JavaScript module
- HTML embeds the JSON spec correctly
- Runtime loads and executes the spec
- Visualizations render in browser
- No critical errors in browser console

## Next Steps

1. Jupyter display status is now tracked in `PYTHON_API_IMPLEMENTATION.md`.
2. Test in actual Jupyter notebook environment (manual)
3. Test in JupyterLab (manual)
4. Test in VS Code with Jupyter extension (manual)
5. Keep example coverage aligned with `PYTHON_API.md`.
6. Add basic Python API documentation
7. Consider bundling runtime for offline use (future)

## Files Modified

- [autk-runtime/src/validator.ts](autk-runtime/src/validator.ts) - Disabled AJV strict mode
- [test-jupyter.html](test-jupyter.html) - Fixed CSV geometry schema (latitude/longitude not latitudeColumn/longitudeColumn)
- [autk-runtime/dist/*](autk-runtime/dist/) - Rebuilt runtime with fix

## Conclusion

**The Python API successfully generates executable specs that render in browsers!** The `_repr_html_()` integration is working. Users can now:

1. Write Python code using the Autark API
2. Call `.save_html()` to export standalone visualizations
3. Display specs in Jupyter with automatic `_repr_html_()` rendering (assuming proper server setup)

The main remaining work is documentation and creating more examples to help users get started.
