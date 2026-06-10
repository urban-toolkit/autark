# Jupyter Integration - Quick Start Guide

## Step-by-Step Instructions

### Step 1: Start Local Development Server

Open a terminal and run:

```bash
cd /Users/csilva/src/autark
python -m http.server 8000
```

Keep this terminal open. You should see:
```
Serving HTTP on :: port 8000 (http://[::]:8000/) ...
```

### Step 2: Test HTML Generation (Simple Test)

Open a **new terminal** and run:

```bash
cd /Users/csilva/src/autark/python/examples
python test_html_output.py
```

This will create `/tmp/autark_html_test.html`. You should see:
```
✅ HTML saved to: /tmp/autark_html_test.html
   File size: XXXX bytes
```

Open it in your browser:
```bash
open /tmp/autark_html_test.html
```

**Expected result:** You should see a map with blue polygons. Check browser console (F12) for any errors.

### Step 3: Test in Jupyter Notebook

With the dev server still running from Step 1, open Jupyter:

```bash
cd /Users/csilva/src/autark/python/examples
jupyter notebook test_jupyter_integration.ipynb
```

Your browser will open with the notebook. Run the cells one by one:

1. **Cell 1 (Setup)** - Should import autark successfully
2. **Cell 2 (Simple GeoJSON)** - Should display an interactive map
3. **Cell 3 (CSV + Histogram)** - Should display map with points and a histogram below
4. **Cell 4 (Spatial Join)** - Should display the full example with linked selection
5. **Cell 5 (JSON Output)** - Should print valid JSON
6. **Cell 6 (HTML Export)** - Should create a file

### What to Look For

✅ **Success indicators:**
- Maps render with data visible
- No red error messages
- Browser console (F12) has no errors
- Histogram appears and is interactive
- Clicking/dragging on histogram highlights features on map

❌ **Problems to watch for:**
- "Module not found" - Runtime JavaScript not loading (check server is running)
- "Failed to fetch" - Data files not accessible (check URLs)
- Blank visualization - Check browser console for errors
- CORS errors - Make sure you're using http://localhost, not file://

### Step 4: Verify Interactive Features

In the spatial join example (Test 3):
1. Hover over the histogram
2. Click and drag to create a brush selection
3. **Check:** Do features on the map get highlighted?

This tests the selection/linking functionality.

## Troubleshooting

### Issue: "Cannot import name 'ak'" or similar

**Fix:** Make sure you ran the setup cell that adds the parent directory to `sys.path`.

### Issue: Blank output or no visualization

**Check:**
1. Is the dev server running? (Check terminal from Step 1)
2. Is the runtime built? Run:
   ```bash
   ls -l /Users/csilva/src/autark/autk-runtime/dist/autk-runtime.js
   ```
   Should see a file. If not, build it:
   ```bash
   cd /Users/csilva/src/autark/autk-runtime
   npm install
   npm run build
   ```

### Issue: "Failed to fetch" for data files

**Fix:** Make sure the dev server is serving from `/Users/csilva/src/autark`, not from a subdirectory.

### Issue: Runtime loads but data doesn't appear

**Check:** Open browser DevTools (F12) → Network tab. Look for:
- ✅ `autk-runtime.js` - Status 200
- ✅ `neighborhoods.geojson` - Status 200
- ✅ `trees.csv` - Status 200

If any are 404, the server path is wrong.

## Alternative: Use CDN or Different Runtime URL

If you don't want to run a local server, you could:

1. **Build and use a bundled runtime** (future work)
2. **Use relative file paths** (but CORS may block)
3. **Deploy to a test server** (e.g., GitHub Pages)

For now, the local server approach is simplest.

## Next Steps After Success

Once you confirm Jupyter integration works:

1. ✅ Update `PYTHON_API_IMPLEMENTATION.md` - Mark "Display works in Jupyter" as complete
2. Create more example notebooks:
   - Simple map example
   - CSV visualization example
   - Thematic mapping example
3. Test in JupyterLab: `jupyter lab` instead of `jupyter notebook`
4. Test in VS Code with Jupyter extension
5. Consider packaging runtime for easier deployment

## Quick Commands Reference

```bash
# Terminal 1: Start dev server
cd /Users/csilva/src/autark && python -m http.server 8000

# Terminal 2: Test HTML output
cd /Users/csilva/src/autark/python/examples && python test_html_output.py

# Terminal 2: Open Jupyter
cd /Users/csilva/src/autark/python/examples && jupyter notebook test_jupyter_integration.ipynb

# Terminal 2: Open JupyterLab (alternative)
cd /Users/csilva/src/autark/python/examples && jupyter lab

# Check runtime is built
ls -l /Users/csilva/src/autark/autk-runtime/dist/autk-runtime.js

# Rebuild runtime if needed
cd /Users/csilva/src/autark/autk-runtime && npm install && npm run build
```
