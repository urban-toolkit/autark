struct CameraUniform {
  viewProjection: mat4x4<f32>,
  cameraPosition: vec4<f32>,
  lightDirection: vec4<f32>,
  settings: vec4<f32>,
  reserved0: vec4<f32>,
  reserved1: vec4<f32>,
  overlayBounds: vec4<f32>,
  overlayUvRect: vec4<f32>,
  waterColor: vec4<f32>,
};

struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) worldPosition: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) level: f32,
};

@group(0) @binding(0) var<uniform> camera: CameraUniform;
@group(0) @binding(1) var terrainHeightTexture: texture_2d_array<f32>;
@group(0) @binding(4) var<uniform> terrainHeights: TerrainHeights;

#include height-lookup.wgsl;

fn terrainNormal(xy: vec2<f32>, sampleDistance: f32) -> vec3<f32> {
  let d = max(sampleDistance, 1.0);
  let hL = terrainHeight(xy - vec2<f32>(d, 0.0));
  let hR = terrainHeight(xy + vec2<f32>(d, 0.0));
  let hD = terrainHeight(xy - vec2<f32>(0.0, d));
  let hU = terrainHeight(xy + vec2<f32>(0.0, d));
  return normalize(vec3<f32>(hL - hR, hD - hU, 2.0 * d));
}

struct PatchVertex {
  height: f32,
  normal: vec3<f32>,
};

// Height and normal of a patch vertex. An edge vertex beside a coarser patch is moved onto
// the neighbour's spacing: it takes the interpolated height of the two points on the edge
// where the neighbour has vertices, so both patches draw the same edge. The neighbour's
// vertices sit at whole multiples of its spacing (blocks are aligned to their size), so
// they are found from the world position alone, for any size difference; when the
// neighbour is much coarser the two points lie outside this patch. The normal is moved the
// same way, interpolated between the neighbour's own vertex normals (each taken at the
// neighbour's spacing), so the shared edge also shades the same from both sides.
// `seams` holds, for the minimum-X, maximum-X, minimum-Y and maximum-Y edges, how many
// levels coarser the neighbour is. CPU twin of the height: `morphEdge` in terrain-seams.ts.
fn patchVertex(blockOrigin: vec2<f32>, blockSize: f32, local: vec2<f32>, seams: vec4<f32>) -> PatchVertex {
  let cells = camera.settings.w;
  let own = blockSize / cells;
  let index = local * cells;
  let position = blockOrigin + local * blockSize;
  var levels = 0.0;
  var alongX = false;
  if (index.x < 0.5 && seams.x > 0.5) {
    levels = seams.x;
  } else if (index.x > cells - 0.5 && seams.y > 0.5) {
    levels = seams.y;
  } else if (index.y < 0.5 && seams.z > 0.5) {
    levels = seams.z;
    alongX = true;
  } else if (index.y > cells - 0.5 && seams.w > 0.5) {
    levels = seams.w;
    alongX = true;
  }

  var vertex: PatchVertex;
  if (levels < 0.5) {
    vertex.height = terrainHeight(position);
    vertex.normal = terrainNormal(position, own);
    return vertex;
  }

  let spacing = own * exp2(levels);
  let along = select(position.y, position.x, alongX);
  let lower = floor(along / spacing) * spacing;
  let weight = (along - lower) / spacing;
  var lowerPoint = position;
  var upperPoint = position;
  if (alongX) {
    lowerPoint.x = lower;
    upperPoint.x = lower + spacing;
  } else {
    lowerPoint.y = lower;
    upperPoint.y = lower + spacing;
  }
  vertex.height = mix(terrainHeight(lowerPoint), terrainHeight(upperPoint), weight);
  vertex.normal = normalize(mix(terrainNormal(lowerPoint, spacing), terrainNormal(upperPoint, spacing), weight));
  return vertex;
}

@vertex
fn vertexMain(
  @location(0) localPosition: vec2<f32>,
  @location(1) levelData: vec4<f32>,
  @location(2) unused: f32,
  @location(3) seamData: vec4<f32>,
) -> VertexOutput {
  _ = unused;
  let blockOrigin = levelData.xy;
  let blockSize = levelData.z;
  let level = levelData.w;
  let worldXY = blockOrigin + localPosition * blockSize;
  let vertex = patchVertex(blockOrigin, blockSize, localPosition, seamData);
  let worldPosition = vec3<f32>(worldXY.x, worldXY.y, vertex.height);

  var output: VertexOutput;
  output.clipPosition = camera.viewProjection * vec4<f32>(worldPosition, 1.0);
  output.worldPosition = worldPosition;
  output.normal = vertex.normal;
  output.level = level;
  return output;
}

@vertex
fn meshVertexMain(
  @location(0) localPosition: vec2<f32>,
  @location(1) levelData: vec4<f32>,
  @location(2) unused: f32,
  @location(3) seamData: vec4<f32>,
) -> VertexOutput {
  _ = unused;
  let blockOrigin = levelData.xy;
  let blockSize = levelData.z;
  let level = levelData.w;
  let scale = blockSize / camera.settings.w;
  let worldXY = blockOrigin + localPosition * blockSize;
  let vertex = patchVertex(blockOrigin, blockSize, localPosition, seamData);
  let normal = vertex.normal;
  let worldPosition = vec3<f32>(worldXY.x, worldXY.y, vertex.height) + normal * max(0.6, scale * 0.08);

  var output: VertexOutput;
  output.clipPosition = camera.viewProjection * vec4<f32>(worldPosition, 1.0);
  output.worldPosition = worldPosition;
  output.normal = normal;
  output.level = level;
  return output;
}

@vertex
fn boundsVertexMain(@location(0) position: vec3<f32>) -> VertexOutput {
  var output: VertexOutput;
  output.clipPosition = camera.viewProjection * vec4<f32>(position, 1.0);
  output.worldPosition = position;
  output.normal = vec3<f32>(0.0, 0.0, 1.0);
  output.level = 0.0;
  return output;
}

@vertex
fn visibleBoundsVertexMain(
  @location(0) localPosition: vec2<f32>,
  @location(1) levelData: vec4<f32>,
  @location(2) unused: f32,
  @location(3) seamData: vec4<f32>,
) -> VertexOutput {
  _ = unused;
  let blockOrigin = levelData.xy;
  let blockSize = levelData.z;
  let level = levelData.w;
  let worldXY = blockOrigin + localPosition * blockSize;
  let vertex = patchVertex(blockOrigin, blockSize, localPosition, seamData);
  let worldPosition = vec3<f32>(worldXY.x, worldXY.y, vertex.height);

  var output: VertexOutput;
  output.clipPosition = camera.viewProjection * vec4<f32>(worldPosition, 1.0);
  output.worldPosition = worldPosition;
  output.normal = vertex.normal;
  output.level = level;
  return output;
}
