# Jupyter Integration Testing Guide

This guide walks through testing the Autark Python API in Jupyter.

> **Tip:** if you just want to display a spec without any local server, use
> the widget instead: `pip install anywidget`, then `spec.widget()` in a cell.
> It ships a bundled runtime inside the Python package and loads DuckDB assets
> from the jsDelivr CDN (data must use absolute URLs or inline values). The
> steps below cover the dev-server display path, which serves local data files
> and freshly built runtimes.

## Prerequisites

1. **Jupyter installed** (already verified: `/opt/miniconda3/bin/jupyter`)
2. **Autark runtime built** - The TypeScript runtime needs to be compiled
3. **Local web server** - To serve the runtime module and data files

## Setup Steps

### 1. Build the TypeScript Runtime

From the repo root:

```bash
cd autk-runtime
npm install
npm run build
```

This creates `autk-runtime/dist/autk-runtime.js`.

### 2. Start a Local Development Server

You need to serve the runtime and data files with CORS enabled, because the
Jupyter page (e.g. port 8888) loads them cross-origin. From the repo root:

```bash
# Start CORS-enabled server on port 8000
python cors_server.py 8000
```

(Or run `./start_jupyter_test.sh` to start the server and Jupyter together.)

The key is that:
- `/autk-runtime/dist/autk-runtime.js` should be accessible
- `/examples/data/` should be accessible

Notes on cross-origin handling (no action needed, just context):
- The runtime creates its DuckDB Web Worker via a same-origin `blob:` URL
  (`autk-db/src/duckdb.ts`), so the browser's cross-origin Worker
  restriction does not apply.
- Root-relative data URLs in specs (e.g. `/examples/data/trees.csv`) are
  automatically resolved against the runtime server's origin when a spec is
  displayed or exported (`python/autark/display.py`).
- A regression test for the cross-origin scenario lives at
  `tests/runtime/cross-origin-worker.test.ts` (uses `test-cross-origin.html`
  and spawns its own servers; runs with `npm run test:runtime`).

### 3. Use a Custom Runtime URL (if needed)

If your server runs on a different port, pass `runtime_url` when displaying
or exporting:

```python
spec.save_html("output.html", runtime_url="http://localhost:8765/autk-runtime/dist/autk-runtime.js")
```

## Running the Test Notebook

### Option 1: Jupyter Notebook

```bash
cd python/examples
jupyter notebook test_jupyter_integration.ipynb
```

This will open the notebook in your browser. Run each cell and check:
- ✅ Cells execute without Python errors
- ✅ Visualizations render (you should see maps/plots)
- ✅ No JavaScript errors in browser console (F12)

### Option 2: JupyterLab

```bash
cd python/examples
jupyter lab test_jupyter_integration.ipynb
```

### Option 3: VS Code Notebooks

Open `test_jupyter_integration.ipynb` in VS Code with the Jupyter extension installed.

## Expected Behavior

Each spec display should show:

1. **Interactive visualization** - Rendered using the TypeScript runtime
   - Maps should show data layers
   - Histograms should render
   - Selection/linking should work (brush on histogram highlights map)

2. **Collapsible spec viewer** - Click "Autark spec" to see the JSON

3. **Error handling** - If the runtime fails to load, you'll see a red error message

## Troubleshooting

### Issue: "Module not found" error in browser console

**Solution:** The runtime JavaScript file isn't accessible. Check:
- Is the dev server running?
- Is the runtime built? (`autk-runtime/dist/autk-runtime.js` exists?)
- Is the `runtime_url` correct in `display.py`?

### Issue: "Failed to fetch" errors for data files

**Solution:** Data files aren't accessible. Check:
- Are the data files at `/examples/data/`?
- Is the dev server serving from the repo root?
- Try absolute URLs instead of relative paths

### Issue: Visualization doesn't render, but no errors

**Solution:**
- Check browser console for warnings
- Verify the runtime module loaded (look for network requests)
- Try opening the saved HTML file directly

### Issue: CORS errors

**Solution:**
- Make sure you're serving files via HTTP, not using `file://` protocol
- If using a different server setup, ensure CORS headers are set

## Manual Testing Checklist

- [ ] Test 1: Simple GeoJSON map renders
- [ ] Test 2: CSV points + histogram render
- [ ] Test 3: Spatial join example renders with linked selection
- [ ] Test 4: JSON output looks correct
- [ ] Test 5: HTML export works and opens in browser
- [ ] Browser console has no errors
- [ ] Selection/linking works (brush on histogram highlights map)
- [ ] Data loads correctly (no 404s)

## Next Steps After Successful Test

Once Jupyter integration is confirmed working:

1. ✅ Mark "Display works in Jupyter" as complete in implementation plan
2. Create more example notebooks (simple map, CSV visualization, etc.)
3. Test in different environments (JupyterLab, VS Code, Colab if possible)
4. Document any runtime URL configuration needed for different setups
5. Consider bundling the runtime for offline use

## Alternative: Test Without Jupyter First

If you want to test the HTML generation without Jupyter:

```python
# In a regular Python script
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import autark as ak

# Create a simple spec
neighborhoods = ak.GeoJSON(
    "neighborhoods",
    url="/examples/data/neighborhoods.geojson",
    coordinate_format="EPSG:4326",
    layer_type="polygons"
)

spec = ak.Spec(
    workspace=ak.Workspace(name="test", coordinate_format="EPSG:4326"),
    data=[neighborhoods],
    views=[
        ak.Map(
            name="test_map",
            layers=[ak.Layer(neighborhoods, type="polygons")]
        )
    ]
)

# Save HTML
spec.save_html("/tmp/test_autark.html")
print("Saved to /tmp/test_autark.html")

# Open in browser
import webbrowser
webbrowser.open("file:///tmp/test_autark.html")
```

This tests the HTML generation without needing Jupyter running.
