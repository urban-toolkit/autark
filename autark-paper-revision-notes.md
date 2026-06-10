# Autark Paper: Implementation Complexity, Manuscript Gaps, and Review Response Notes

Prepared from:

- Submitted paper: `/Users/csilva/Dropbox/2026-submitted-papers/vis26c-sub1774-i6.pdf`
- Reviews: `/Users/csilva/Downloads/Reviews of #1774 _Autark_ A Serverless Toolkit for Prototyping Urban ..._.pdf`
- Current repository: `/Users/csilva/src/autark`

PDF text was extracted with `/opt/homebrew/bin/pdftoipe`; the extraction is imperfect but sufficient for section-level analysis.

## Executive Summary

Autark has more implementation novelty than the submitted manuscript makes visible. The paper correctly emphasizes the serverless architecture, feature-centric model, usage scenarios, performance viability, and LLM/agentic development experiment. However, it often describes implementation-heavy modules as high-level capabilities: "spatial database", "GPU compute engine", "3D map", and "abstract charts." This hides several technically sophisticated algorithms and pipelines that could strengthen the system contribution if described compactly.

The strongest technical material in the implementation is:

1. Render-based WebGPU analytics for viewpoint/visibility/sky-exposure-style metrics.
2. Dynamic GeoJSON-to-WGSL GPGPU computation with shader generation and typed buffer packing.
3. OSM ingestion and semantic layer reconstruction, including PBF decoding, Overpass handling, relation ring reconstruction, surface polygonization, and building aggregation.
4. Geometry generation for buildings and roofs, including multiple roof types and straight-skeleton-style roof solving.
5. Spatial join query generation over DuckDB-WASM, including intersect/near predicates, aggregation, normalization, weighted proximity, and JSON property merging.
6. Unified WebGPU rendering and picking over all map layers, which supports the feature-centric interaction model.

The reviews are not mainly saying "the system is weak." They are saying the paper does not make the system easy to evaluate. Reviewers consistently saw the architectural value but wanted clearer structure, better comparison to alternatives, clearer positioning relative to Urban Toolkit, a stronger developer/agentic evaluation story, and a more readable description of the programming model.

The revised paper should not become a manual. Instead, it should add a few "algorithmic capsules" and interface-level descriptions that explain what the toolkit encapsulates, why those internals are hard, and why exposing them as feature-level APIs is novel/useful.

## What Seems Most Technically Sophisticated in the Code

### 1. Render-Based GPU Compute

Primary files:

- `autk-compute/src/compute-render.ts`
- `autk-compute/src/shaders/render-*.wgsl`
- `autk-compute/src/viewpoint.ts`
- `usecases/src/urbane/analysis.ts`
- `gallery/src/autk-map/compute-render-osm-sky-exposure.ts`

Why it is sophisticated:

- It triangulates feature layers into renderable geometry.
- It resolves viewpoint samples and builds camera matrices.
- It batches viewpoint rendering according to WebGPU limits.
- It renders tiled offscreen views.
- It runs a counting pass to aggregate visibility/class/object information.
- It maps GPU outputs back into `feature.properties.compute.render`.
- It supports class aggregation and object visibility aggregation.
- It handles GPU memory limits, uniform buffer alignment, staging buffers, and CPU-side accumulation.

This is the implementation behind sky exposure and visibility-like urban analytics. It is more than "GPU acceleration"; it is a render-as-analysis pipeline.

Paper coverage:

- Section 4.2.2 says the compute engine can execute analytical or render-based operations and mentions "pixel counting for feature identification."
- Section 5.1 uses sky exposure in Urbane and shadow contribution in the Chicago example.
- Section 5.2 includes one render-based computation benchmark.

What is missing:

- A concise explanation of the render-compute algorithm.
- A diagram showing: features -> triangulation -> sampled cameras -> offscreen tiles -> count shader -> feature-level metrics.
- A clear statement that this encapsulates a recurring class of 3D urban VA analyses: sky exposure, landmark visibility, view impact, shadow/source contribution, object visibility.

Suggested paper addition:

Add an "Implementation Note: Render-based analytics" box in Section 4.2.2:

```ts
type RenderLayer = {
  id: string;
  collection: FeatureCollection;
  type: "buildings" | "roads" | "polygons" | ...;
};

type RenderPipelineParams = {
  layers: RenderLayer[];
  viewpoints: { collection: FeatureCollection; sampling?: ViewSampling };
  aggregation: { type: "classes" | "objects"; includeBackground?: boolean };
  tileSize?: number;
};
```

Then describe the implementation in one paragraph rather than exposing shader details.

### 2. Dynamic GPGPU Shader Pipeline

Primary files:

- `autk-compute/src/compute-gpgpu.ts`
- `autk-compute/src/types-gpgpu.ts`
- `autk-compute/src/compute-pipeline.ts`
- `usecases/src/urbane/analysis.ts`
- `usecases/src/niteroi/lst-regression-shader.ts`

Why it is sophisticated:

- Maps GeoJSON property paths to GPU input buffers.
- Supports scalar, fixed array, fixed matrix, and auto-row matrix inputs.
- Supports uniforms, uniform arrays, and uniform matrices.
- Validates WGSL identifiers and prevents generated symbol collisions.
- Generates complete WGSL around user-provided computation bodies.
- Dispatches WebGPU compute workgroups.
- Reads GPU results back and writes them into `feature.properties.compute`.

This is effectively a small domain-specific GPU runtime for feature collections.

Paper coverage:

- Section 4.2.2 describes feature-wise GPU computation and shows a simple volume example.
- Niteroi heat island example describes per-road linear regression.
- Urbane example describes weighted score computation.

What is missing:

- The paper underplays that the engine is not just "accept WGSL"; it handles packing/unpacking, input binding, generated shader structure, validation, and result reintegration.
- The regression example could be used to show why arrays/matrices matter, not only scalar examples.

Suggested paper addition:

Use the simple scalar example only as an introductory snippet, then add a sentence like:

"Internally, Autark packs feature attributes into columnar typed arrays, generates WGSL bindings for scalar, array, and matrix attributes, validates shader identifiers, dispatches the computation over all features, and writes outputs back into `properties.compute`, preserving the original feature collection."

### 3. OSM Processing and Semantic Layer Reconstruction

Primary files:

- `autk-db/src/db.ts`
- `autk-db/src/internal/process-osm/pipeline.ts`
- `autk-db/src/use-cases/load-osm-overpass/use-case.ts`
- `autk-db/src/use-cases/load-osm-pbf/use-case.ts`
- `autk-db/src/use-cases/load-osm-pbf/osm-pbf-parser.ts`
- `autk-db/src/use-cases/load-osm-layer/use-case.ts`
- `autk-db/src/use-cases/load-osm-layer/queries.ts`
- `autk-db/src/internal/process-osm-buildings/use-case.ts`
- `autk-db/src/internal/process-osm-surface/use-case.ts`

Why it is sophisticated:

- Supports both Overpass and PBF OSM ingestion paths.
- Converts raw nodes/ways/relations into flat records for DuckDB.
- Derives layer tags for roads, buildings, parks, water, and surface.
- Reconstructs way geometry from node references.
- Builds relation area geometries from outer/inner way members.
- Stitches closed rings and emits Polygon/MultiPolygon geometries.
- Transforms CRS and clips layers to workspace extents.
- Polygonizes surface boundaries.
- Aggregates building components and assigns coherent `building_id` values.

This directly supports a key claim in the LLM comparison: baseline agents often operate on raw, fragmented geometry, while Autark reconstructs semantically coherent urban features.

Paper coverage:

- Section 4.2.1 says the database fetches and parses OSM layers.
- Section 5.3 says Autark reconstructs semantically coherent building footprints and baseline systems lack this consolidation.
- Figure 6 shows baseline geometry artifacts.

What is missing:

- The paper does not explain how the semantic reconstruction works at even a conceptual level.
- The current text makes the database sound like a thin DuckDB/Overpass wrapper, when it is actually a domain-specific ETL layer.

Suggested paper addition:

Add a short "OSM-to-feature pipeline" paragraph or figure:

```text
OSM nodes/ways/relations
  -> layer tagging
  -> way geometry reconstruction
  -> relation ring assembly
  -> CRS transform and clipping
  -> building/surface post-processing
  -> feature collections consumed by map/compute/charts
```

This would directly address reviewer concerns about differentiation and architecture being more than packaging convenience.

### 4. Building and Roof Mesh Generation

Primary files:

- `autk-core/src/triangulator-buildings.ts`
- `autk-core/src/triangulator-roofs.ts`
- `autk-core/src/triangulator-polygons.ts`
- `autk-core/src/triangulator-polylines.ts`
- `autk-core/src/triangulator-windows.ts`

Why it is sophisticated:

- Building geometry is not rendered as a simple extrusion only.
- The code parses OSM building height metadata (`height`, `levels`, `min_height`, etc.).
- It generates walls, floors, and roof caps.
- It supports multiple roof shapes: flat, pyramid/cone, dome, round, skillion, hipped, gabled, half-hipped, mansard, saltbox.
- The roof code includes a straight-skeleton-style process for complex roof forms and fallbacks for unstable cases.
- Polygon triangulation supports holes via `earcut`.

Paper coverage:

- The paper says the 3D map renders buildings and that all data are represented as triangle meshes.
- The LLM evaluation notes mesh artifacts in baseline outputs.

What is missing:

- The paper does not communicate that Autark provides nontrivial geometry processing for urban physical layers.
- This could help explain why the map is not simply a wrapper around deck.gl/Mapbox.

Suggested paper addition:

Add one compact sentence in Section 4.2.3:

"For physical layers, the map does not rely on pre-rendered tiles: Autark triangulates GeoJSON into GPU meshes, including OSM building parts with height metadata, wall/floor caps, and roof geometry, so rendering, picking, and compute all share the same feature-level mesh representation."

If space permits, add a table of supported geometric conversions.

### 5. Spatial Join Query Builder

Primary files:

- `autk-db/src/use-cases/spatial-join/use-case.ts`
- `autk-db/src/use-cases/spatial-join/queries.ts`
- `autk-db/src/use-cases/build-heatmap/use-case.ts`

Why it is sophisticated:

- Dynamically builds DuckDB spatial SQL.
- Supports intersect and near predicates.
- Supports centroid-based near joins.
- Pre-filters near joins with expanded geometry envelopes.
- Builds JSON `sjoin` properties.
- Supports `count`, `avg`, `sum`, `min`, `max`, `collect`, and weighted proximity.
- Supports normalization of aggregated outputs.
- Handles both JSON `properties` columns and direct table columns.
- Heatmap generation builds a spatial grid, indexes it, runs a near aggregation, then rewrites results as raster-band properties.

Paper coverage:

- Section 4.2.1 says the database supports spatial joins and nearest-neighbor queries.
- Usage examples rely heavily on spatial joins.
- Performance section benchmarks spatial join scalability.

What is missing:

- The paper does not explain that spatial join outputs are written back into feature properties in a consistent schema.
- The `sjoin` nested property convention is important because it is the bridge from database operations to map/plot thematic encodings.

Suggested paper addition:

Use a short TypeScript interface instead of only mathematical notation:

```ts
type SpatialJoinOutput = FeatureCollection & {
  features: Array<Feature & {
    properties: {
      sjoin?: {
        count?: Record<string, number>;
        avg?: Record<string, number>;
        weighted?: Record<string, number>;
      };
    };
  }>;
};
```

This would directly satisfy Reviewer 3's request for TypeScript interfaces and make the feature-centric model concrete.

### 6. Unified Rendering, Picking, and Linked Interaction

Primary files:

- `autk-map/src/map.ts`
- `autk-map/src/renderer.ts`
- `autk-map/src/layer*.ts`
- `autk-map/src/pipeline*.ts`
- `autk-plot/src/plot.ts`
- `autk-plot/src/plot-base-interactive.ts`

Why it is sophisticated:

- All spatial layers go through one WebGPU renderer.
- Picking is feature/component-aware and can drive selections.
- Map and plot modules share event semantics over feature IDs.
- The system avoids the "multiple rendering libraries / fractured interaction stack" problem observed in baseline LLM outputs.

Paper coverage:

- Section 4.1 explains the feature-centric interaction model.
- Section 4.2.3 and 4.2.4 explain map/chart events.
- Figure 3 demonstrates linked map/plot interaction.
- Section 5.3 identifies fragmented visual stacks in baseline outputs.

What is missing:

- The implementation mechanism behind picking and cross-view identity could be clearer.
- The paper should connect "single renderer" and "single feature ID space" more explicitly to correctness, not only convenience.

## Mismatches Between Current Code and Submitted Paper

Some paper snippets appear out of sync with the current public API. This matters because Reviewer 3 explicitly asked for TypeScript interfaces and programming-model clarity. If the revised paper uses interface snippets, they should match the actual package.

Observed mismatches:

- Paper: `AutkSpatialDb`; current code: `AutkDb`.
- Paper: `loadOsmFromOverpassApi`; current code exposes `loadOsm`, selecting Overpass vs. PBF via params.
- Paper: `AutkChart`; current code: `AutkPlot`.
- Paper snippets use callback-style thematic mapping; current map API uses property paths, e.g. `updateThematic(id, { collection, property })`.
- Paper event snippets imply callbacks receive `selection` directly; current examples use event payloads such as `({ selection }) => ...`.
- Paper spatial query example uses `spatialPredicate: 'JOIN' | 'NEAREST'`; current API appears to expose intersect/near through `near` config and spatial join params.

Recommendation:

Before resubmission, regenerate every API snippet from current examples in `gallery/src` and `usecases/src`. The paper should use the real current API, or clearly mark any snippet as pseudocode. Given the reviews, using accurate TypeScript interfaces is preferable.

## What the Paper Already Communicates Well

The reviewers did notice several strengths, and the paper contains the material to support them:

- Serverless, browser-based architecture.
- Feature-centric model unifying data, rendering, and interaction.
- Four modules: database, compute, map, charts.
- Urbane remake, shadow analysis, heat island analysis.
- Performance viability for loading, joins, and render compute.
- LLM/agentic comparison showing fewer LOC, fewer files, fewer dependencies, and lower cyclomatic complexity.

The problem is presentation and emphasis, not absence of a system.

## What Is Missing or Under-Described

### Missing Technical Depth

The paper abstracts away the hard internal work. It should add concise implementation descriptions for:

- Render-based analytics.
- Dynamic WGSL computation.
- OSM semantic reconstruction.
- Building/roof triangulation.
- Spatial join output schema.
- Unified picking/feature ID propagation.

These should be framed as "what the toolkit encapsulates" rather than as a manual.

### Missing Comparison Table

Reviewer 1 explicitly requested a systematic comparison. The paper should include a table comparing Autark with:

- Urban Toolkit.
- deck.gl / Mapbox / MapLibre.
- Vega-Lite.
- Mosaic.
- DuckDB-WASM alone.
- QGIS/ArcGIS, perhaps as desktop GIS baselines.

Suggested columns:

- Browser-only / static deployment.
- OSM semantic layer extraction.
- Spatial joins in browser.
- Feature-level linked interaction.
- Unified 3D map + abstract charts.
- GPU analytical compute.
- Render-based urban analytics.
- Raster/GeoTIFF support.
- LLM-friendly narrow API / promptable documentation.
- Extensibility/custom visualization.

The key argument should be that Autark is not merely packaging convenience. It combines these capabilities around a single feature collection/selection contract.

### Missing Urban Toolkit Positioning

Reviewer 1 is right that the relationship to Urban Toolkit needs explicit treatment. The paper mentions Urban Toolkit, but does not clearly answer:

- Why build Autark instead of extending Urban Toolkit?
- What limitations of Urban Toolkit motivated Autark?
- What changed in target usage?

Likely distinction to articulate:

- Urban Toolkit: grammar-based, client-server, focused on expressing urban VA views/layers.
- Autark: serverless browser runtime, feature-centric API, in-browser spatial database, GPU compute, LLM-friendly modular TypeScript package, direct support for agentic/prototyping workflows.

This should be stated in Related Work and perhaps revisited in the comparison table.

### Missing Developer Evaluation

Reviewer 1 wanted a user/developer study. This is the hardest concern to fully address with writing alone.

Possible responses:

- If feasible: run a small external developer study before resubmission.
- If not feasible: narrow the claim. Present Autark primarily as a system/toolkit contribution with an initial agentic coding evaluation, not as a proven developer productivity intervention.
- Add qualitative evidence from external users if available: setup time, time to first working prototype, errors encountered, comprehension of feature-centric model.

A minimal study could be:

- 6-10 participants familiar with TypeScript or visualization.
- Task: build a small urban VA app from provided data.
- Conditions: Autark docs only vs. chosen common stack, or Autark with/without feature-centric tutorial.
- Measures: completion rate, time, number of help interventions, LOC, subjective NASA-TLX-like burden, post-task questions about model clarity.

### Agentic Coding Claim Needs Repositioning

Reviewer 2 saw a disconnect: is the contribution a toolkit for urban VA that also helps agents, or a toolkit specifically designed for agentic coding?

Recommendation:

Position Autark as:

"A serverless, feature-centric toolkit for urban VA whose constrained, typed APIs also make it suitable for agentic coding."

Avoid making LLM-readiness the primary contribution unless the revised paper foregrounds the agentic workflow throughout. The current usage scenarios are compelling as urban VA systems, but not enough by themselves to support a central "agentic coding" claim.

### Software Metrics Need More Care

Reviewer 2 objected that "single file" can be a bad quality metric. The revision should not imply one file is inherently better. Reframe:

- LOC, file count, dependencies, and cyclomatic complexity are proxies for inspection burden, not universal quality.
- Single-file outputs are not always desirable; what matters is whether the generated system remains small enough to inspect, build, and verify.
- Add generation time and token consumption if available, as Reviewer 3 requested.
- Add functional correctness / failure categories more explicitly.

## Review Crosswalk

### R1 / Summary: Writing and Structure

Reviewer concern:

- Monolithic paragraphs.
- Hard to navigate.
- Key ideas buried.

Assessment:

- Valid. Section 3 and Section 4.1 are dense.
- The design principles are present, but not skimmable.
- The feature-centric model is central, but the notation competes with the programming model.

Recommended response:

- Rewrite Section 3 as explicit principles:
  - Urban-specific.
  - Web-first/serverless.
  - Component-oriented.
  - Feature-centric.
  - LLM-ready.
- Give each principle 2-3 sentences and one design consequence.
- Add a summary table: principle -> system decision -> implementation mechanism.

### R1: Related Work Lacks Synthesis

Reviewer concern:

- Related work reads like a catalog.
- Need gaps and positioning.

Assessment:

- Mostly valid. The paper names many works, but the "why Autark is different" argument should be sharper.

Recommended response:

- End each related-work subsection with a synthesis paragraph.
- Add a comparison table.
- Explicitly contrast Autark with Urban Toolkit, Mosaic, deck.gl/Mapbox, GIS tools, and general LLM dashboard systems.

### R1: Urban Toolkit Relationship

Reviewer concern:

- Urban Toolkit appears to be the direct predecessor and is under-discussed.

Assessment:

- Valid and important.

Recommended response:

- Add a paragraph explaining why Urban Toolkit was not simply extended.
- Frame Autark as a shift from grammar/client-server architecture to feature-centric/serverless/API-oriented toolkit.

### R1: No User Study

Reviewer concern:

- All usage scenarios are authored by toolkit developers.

Assessment:

- Valid, unless the target venue accepts the system contribution plus performance and agent study as sufficient.

Recommended response:

- Add small developer study if feasible.
- Otherwise, reduce claims about learnability/productivity and present developer evaluation as future work.
- Keep the agentic evaluation as "initial evidence."

### R2: Agentic Coding Disconnect

Reviewer concern:

- Unclear whether Autark is a toolkit that can help agents or a toolkit designed specifically for agents.

Assessment:

- Valid. The abstract and introduction foreground LLMs strongly, but most scenarios are not organized as agentic workflows.

Recommended response:

- Choose one primary narrative.
- Recommended: urban VA toolkit first; agentic-readiness as a secondary consequence and evaluation dimension.
- Add one figure showing the actual agentic workflow: prompt + Autark docs/interfaces -> generated app -> verification.

### R2: Software Quality Metrics

Reviewer concern:

- File count/single-file output may be a questionable quality signal.

Assessment:

- Valid. Single-file code is not inherently maintainable.

Recommended response:

- Reframe metrics as "inspection burden" proxies.
- Add token count, generation time, build success, functional correctness categories.
- Avoid saying single-file is good by itself.

### R2: Architectural Limitations

Reviewer concern:

- May bias toward 3D representations and predefined charts/interactions.

Assessment:

- Partly valid. The paper mentions custom D3 extensibility but could emphasize that packages are modular and charts are optional.

Recommended response:

- Add a limitation and clarify extension points.
- Add examples of using `autk-db` or `autk-compute` without `autk-map`.

### R3: TypeScript Interfaces Instead of Math

Reviewer concern:

- The formal notation in Section 4.1 obscures the programming model.

Assessment:

- Strongly valid for a toolkit paper.

Recommended response:

- Keep the feature-centric concept, but replace most notation with TypeScript interfaces:

```ts
type FeatureId = string | number;

type AutkFeature = Feature<Geometry, {
  [key: string]: unknown;
  sjoin?: Record<string, Record<string, number>>;
  compute?: Record<string, unknown>;
}>;

type FeatureSelection = FeatureId[];

interface FeatureConsumer {
  updateCollection(collection: FeatureCollection): void;
  setSelection(selection: FeatureSelection): void;
}
```

Use one small equation only if necessary.

### R3: Generation Speed and Token Consumption

Reviewer concern:

- Add speed and token consumption to LLM metrics.

Assessment:

- Good suggestion and likely easy if experiment logs exist.

Recommended response:

- Report median/mean generation time.
- Report input/output token counts or approximate transcript sizes.
- Report number of agent iterations/tool calls/build failures if available.

## Recommended Revised Paper Structure

One possible structure:

1. Introduction
   - Problem: urban VA prototypes require recurring complex infrastructure.
   - Opportunity: browser runtimes + WebGPU/WASM + structured APIs.
   - Contribution: serverless feature-centric toolkit; agentic-readiness as secondary.

2. Related Work and Positioning
   - Urban VA systems and recurring components.
   - Urban VA toolkits, including Urban Toolkit.
   - Browser/serverless data and visualization tools.
   - LLM/agentic VA development.
   - Comparison table.

3. Design Goals
   - Urban-specific.
   - Web-first/serverless.
   - Component-oriented.
   - Feature-centric.
   - Agent-friendly typed API.

4. Programming Model
   - TypeScript interfaces for feature collection, selection, module contracts.
   - Dataflow figure.
   - Short explanation of why this removes translation layers.

5. System Implementation
   - Database and OSM-to-feature pipeline.
   - GPU compute: analytical and render-based.
   - Map: triangulation, rendering, picking.
   - Charts: feature-bound plots and extensibility.
   - Add "implementation capsules" for the most complex internals.

6. Usage Scenarios
   - Urbane remake.
   - Shadow analysis.
   - Heat island analysis.
   - For each: state which Autark internals are exercised.

7. Evaluation
   - Performance.
   - Agentic coding experiment.
   - Optional developer study.

8. Limitations and Future Work

## Concrete Additions That Would Most Improve Novelty/Clarity

Highest priority:

1. Add a feature comparison table against closest alternatives.
2. Replace mathematical formalization with TypeScript interfaces and a short dataflow diagram.
3. Add an OSM semantic reconstruction pipeline figure.
4. Add a render-based GPU analytics capsule.
5. Clarify the relationship to Urban Toolkit.
6. Reframe agentic coding as secondary unless the workflow is foregrounded throughout.
7. Add generation time/token metrics and avoid treating single-file output as inherently good.
8. Add a small developer study or explicitly narrow claims about learnability.

## Suggested "Implementation Complexity" Table for the Paper

| Capability | What Autark Exposes | Hidden Implementation Complexity | Why It Matters |
| --- | --- | --- | --- |
| OSM layer loading | `db.loadOsm(...)` | Overpass/PBF parsing, layer tagging, relation reconstruction, CRS transform, clipping, building aggregation | Converts raw OSM into coherent urban features instead of fragmented geometries |
| Spatial joins | `db.spatialQuery(...)` | Dynamic DuckDB spatial SQL, intersect/near predicates, aggregation, normalization, JSON property merging | Makes thematic-to-physical data integration one operation |
| Analytical GPU compute | `compute.gpgpuPipeline(...)` | Property-path extraction, typed buffer packing, WGSL generation, validation, dispatch, readback | Lets users write feature-wise analytics without WebGPU boilerplate |
| Render-based compute | `compute.renderPipeline(...)` | Triangulation, viewpoint sampling, offscreen tiled rendering, count pass, feature-level aggregation | Supports visibility, sky exposure, and view-impact analyses |
| Map rendering/picking | `map.loadCollection(...)`, `MapEvent.PICKING` | Mesh generation, WebGPU pipelines, picking buffers, feature/component alignment | Keeps rendering and interaction in the same feature ID space |
| Linked charts | `new AutkPlot(...)` | Plot-specific transforms, event-to-selection mapping, feature-bound updates | Enables coordinated views without custom glue code |

## Bottom Line

The revised paper should make the reader understand that Autark is not just a convenient bundle of DuckDB, WebGPU, D3, and a map. Its novelty is the combination of:

- a feature-centric contract,
- serverless browser execution,
- domain-specific urban data processing,
- GPU analytical/render compute,
- unified rendering and interaction,
- and a constrained API surface that is easier for humans and agents to compose.

The current manuscript contains pieces of this story, but the implementation complexity is under-described and the contribution hierarchy is blurred by the LLM framing. A stronger version should foreground Autark as a technical urban VA system/toolkit contribution, then use agentic coding as an evaluation lens showing why the abstraction boundary matters.

## Additional Discussion: Repositioning and Developer Evaluation

### Reposition Away From Agentic Coding as the Core Claim

A likely major source of reviewer confusion is that the submitted paper tried too hard to frame Autark around "agentic coding." Agentic coding is relevant, but it is not the core contribution. The core work is a serverless, feature-centric urban VA toolkit that encapsulates difficult recurring infrastructure for urban visual analytics prototypes.

Recommended positioning:

- Primary contribution: Autark as a serverless, feature-centric toolkit for urban VA prototyping.
- Technical novelty: browser-side spatial data management, OSM semantic reconstruction, WebGPU analytical/render compute, unified map rendering/picking, and linked abstract charts through one feature collection/selection model.
- Evaluation: usage scenarios, performance, and developer evaluation.
- Agentic coding: a secondary consequence of the same design. Autark's typed, narrow, domain-specific APIs can help LLMs produce more cohesive code, but this should not be the main story unless the entire paper, video, website, and evaluation are reorganized around agentic workflows.

Suggested revised framing sentence:

> Autark is a serverless, feature-centric toolkit for rapid urban visual analytics prototyping. Its constrained TypeScript APIs also make it suitable for agent-assisted development, but this is a consequence of the toolkit design rather than the central contribution.

This framing would likely resolve Reviewer 2's concern about whether the paper contributes a toolkit for urban VA systems or a toolkit specifically designed for agentic coding. The revised manuscript should make the answer clear: it is first a toolkit for urban VA systems; agentic coding is an important emerging use case and evaluation lens.

### Addressing the Long-Paragraph Problem

The reviewers' criticism of long paragraphs is fair and should be addressed structurally, not just by copyediting. A systems paper needs visible signposts:

- What problem is being solved?
- What design decision addresses it?
- What implementation mechanism realizes it?
- What evidence supports it?

Recommended structure changes:

- Break Section 3 into explicit design goals/principles, each with a short title and 2-3 sentence explanation.
- Replace dense prose in Section 4.1 with a compact programming-model description and TypeScript interfaces.
- Add summary tables for design principles, module responsibilities, and comparison to alternatives.
- Use short "implementation capsule" boxes to expose technical depth without turning the paper into API documentation.
- Make each usage scenario explicitly list which Autark capabilities it exercises.

### Proposed Developer Evaluation

To strengthen the evaluation and directly address Reviewer 1's concern that all usage scenarios were author-built, run a small developer evaluation. This should be framed as a developer/prototyping study, not a full domain-user study of urban planning outcomes.

Goal:

Evaluate whether TypeScript-proficient users outside the author team can understand Autark's programming model and build a small urban VA prototype after a short tutorial.

Participants:

- 6-10 participants.
- Comfortable with TypeScript or JavaScript.
- Preferably some mix of visualization/geospatial experience, but not required.
- Exclude Autark developers and close collaborators who already know the system.

Session format:

- One morning session, approximately 3-4 hours.
- In person or synchronous remote.
- Use a controlled starter repo and fixed datasets.

Suggested schedule:

1. 20 minutes: tutorial on Autark concepts.
   Cover feature collections, selections, `AutkDb`, `AutkMap`, `AutkPlot`, and optionally `AutkCompute`.

2. 20 minutes: guided warm-up.
   Participants load a small GeoJSON layer and render a thematic map.

3. 90-120 minutes: independent build task.
   Participants build a small urban VA prototype from provided data.

4. 20-30 minutes: survey and short interview.
   Collect subjective feedback, pain points, and suggestions.

Candidate task:

> Build an urban VA prototype that loads neighborhood polygons and a CSV of incidents, joins incidents to neighborhoods, renders a thematic map, and adds one linked chart where brushing/clicking highlights features on the map.

Optional stretch goals:

- Load OSM buildings or roads.
- Use a nearest-neighbor join to associate points with buildings or roads.
- Add a GPU-derived score or weighted metric.
- Add color-map controls.
- Add a second linked chart.

Metrics to collect:

- Completion rate for each milestone.
- Time to first successful build.
- Time to first rendered map.
- Time to successful spatial join.
- Time to linked map/chart interaction.
- Number and type of errors.
- Number of help requests.
- Which examples/docs participants used.
- Whether the final prototype meets functional requirements.
- Subjective ratings of API clarity, feature-centric model clarity, frustration, confidence, and likelihood of reuse.

Qualitative data:

- Observer notes.
- Screen recordings or IDE activity logs, with consent.
- Build logs and terminal errors.
- Short post-task survey.
- 5-10 minute semi-structured interview.

Possible survey prompts:

- "I understood how data flows between Autark modules."
- "The feature collection / selection model was clear."
- "The examples were sufficient for completing the task."
- "The API names and TypeScript types helped me understand what to do."
- "I could imagine using Autark for a future urban VA prototype."
- "What was the most confusing part of the workflow?"
- "What documentation or example was missing?"

Milestone rubric:

| Milestone | Success Criteria |
| --- | --- |
| Build setup | App installs/builds/runs from starter repo |
| Data load | Participant loads provided GeoJSON/CSV or OSM layer |
| Spatial join | Output feature properties contain joined/aggregated values |
| Map rendering | Thematic layer appears with correct coloring |
| Plot rendering | At least one chart renders from the same feature collection |
| Linked interaction | Selection in map or plot highlights corresponding features in the other view |
| Explanation | Participant can describe the dataflow and where joined/computed values live |

How to report it in the paper:

> To evaluate learnability and practical prototyping support, we conducted a half-day developer study with TypeScript-proficient participants. After a short tutorial, participants built an urban VA prototype using Autark from provided data. We measured task completion, time-to-milestone, support requests, build/runtime errors, and perceived API clarity.

This would directly support the claim that Autark lowers prototyping overhead for developers outside the author team. It also reduces the pressure on the agentic coding experiment to carry the entire evaluation burden.

### Relationship to Agentic Coding Evaluation

If the developer evaluation is added, the agentic coding experiment should be reframed as secondary:

- Developer study: evidence that humans can learn/use Autark.
- Usage scenarios: evidence that Autark is expressive enough for nontrivial urban VA systems.
- Performance: evidence that browser-side execution is viable.
- Agentic coding experiment: evidence that the same abstraction boundaries also help LLM-based code generation.

This creates a cleaner evaluation story:

1. Can Autark build real systems? Usage scenarios.
2. Can it run interactively in the browser? Performance.
3. Can new developers use it? Developer evaluation.
4. Do its abstractions help agents? Agentic coding experiment.
