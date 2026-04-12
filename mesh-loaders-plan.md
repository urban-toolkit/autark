### Implementation Plan: 3D Mesh Parsers

#### 1. Architecture & Naming Conventions
We will follow the exact flat-file structure and naming conventions already established in `autk-core/src/` (e.g., `triangulator-buildings.ts`).

New files in `autk-core/src/`:
*   `parser-obj.ts` (Handles Wavefront OBJ files)
*   `parser-3dm.ts` (Handles Rhino 3DM files)

Both will expose a unified static method signature, similar to the triangulators:
`static parse(buffer: ArrayBuffer | string, origin: number[]): [LayerGeometry[], LayerComponent[]]`

#### 2. Dependencies
We will leverage well-known, robust libraries to avoid reinventing complex parsing logic and handle edge cases natively:
*   **`.3dm`**: We will add `rhino3dm` (the official WebAssembly library from McNeel) to `autk-core` dependencies. It natively handles iterating through complex Rhino documents, extracting meshes, and tessellating BREPs.
*   **`.obj`**: We will add a popular library like `webgl-obj-loader` to parse the OBJ string, handle n-gons, quad-to-triangle splitting, and vertex indexing.

#### 3. Coordinate Systems & Georeferencing
Since `autk-map` operates in projected coordinate space, the parsers will assume the vertices in the `.3dm` and `.obj` files are *already projected* (e.g., in EPSG:3857 Web Mercator, or a State Plane system like NYLI). 

The only coordinate transformation the parsers will perform is subtracting the `origin` parameter:
```typescript
[vertex.x - origin[0], vertex.y - origin[1], vertex.z - (origin[2] || 0)]
```
This localizes the massive projected coordinates (which can easily exceed Float32 precision limits) down to the local tile/camera space required by the GPU, exactly as `TriangulatorBuildings` currently does.

#### 4. Implementation Steps by Format

**A. Rhino 3DM (`parser-3dm.ts`)**
1.  **Initialize**: Load the `rhino3dm` WASM module. Because `rhino3dm` initialization is asynchronous (`rhino3dm()`), the `parse` method will need to be `async`.
2.  **Parse**: Load the `Uint8Array` into a `rhino.File3dm` instance.
3.  **Iterate**: Loop through `doc.objects()`.
4.  **Extract**: 
    *   If the geometry is a `Mesh`, extract its vertices and faces.
    *   If it is a `Brep` or `Extrusion`, call the built-in `.faces().mesh()` or `CreateFromBrep` methods to tessellate it into triangles.
5.  **Localize**: Apply the `origin` offset to the vertices. 
6.  **Memory Management**: Explicitly call `.delete()` on the Rhino C++ bindings as we iterate to prevent WASM memory leaks, which is critical for parsing a 374 MB file like `nyc_buildings_MN01.3dm`.

**B. Wavefront OBJ (`parser-obj.ts`)**
1.  **Parse**: Pass the raw file string to the `webgl-obj-loader` `Mesh` class.
2.  **Extract**: Read the resulting `vertices`, `vertexNormals` (if present) and `indices`.
3.  **Localize**: Subtract the `origin` from every vertex.
4.  **Package**: Push the geometry into `LayerGeometry[]` chunks and update `LayerComponent[]` counts.

#### 5. Gallery Integration (`gallery/src/autk-map/mesh-api.ts`)
We will create a dedicated example in the gallery to test and visualize the `nyc_buildings_MN01.3dm` file:
1.  **Setup**: Initialize a basic `Map` instance with a background layer.
2.  **Fetch**: Download `/data/nyc_buildings_MN01.3dm` as an `ArrayBuffer`.
3.  **Parse**: Call `await Parser3DM.parse(buffer, [originX, originY])`. (We will need to determine the correct `origin` for this specific dataset, likely somewhere in lower Manhattan in its native projection).
4.  **Render**: Feed the resulting `[geometry, components]` directly into a `Triangles3DLayer`.
5.  **Lighting/Style**: Apply a solid color or thematic styling to verify the normals (or flat shading) look correct on the complex imported geometry.