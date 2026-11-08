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
@group(0) @binding(3) var overlayTexture: texture_2d<f32>;

fn insideUnit(uv: vec2<f32>) -> bool {
  return uv.x >= 0.0 && uv.y >= 0.0 && uv.x <= 1.0 && uv.y <= 1.0;
}

fn overlayUv(xy: vec2<f32>) -> vec2<f32> {
  let uv = (xy - camera.overlayBounds.xy) / camera.overlayBounds.zw;
  return camera.overlayUvRect.xy + vec2<f32>(uv.x, 1.0 - uv.y) * camera.overlayUvRect.zw;
}

fn inOverlayBounds(xy: vec2<f32>) -> bool {
  let uv = (xy - camera.overlayBounds.xy) / camera.overlayBounds.zw;
  return insideUnit(uv);
}

@fragment
fn pickingFragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  if (!inOverlayBounds(input.worldPosition.xy)) {
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
  }

  let dims = vec2<i32>(textureDimensions(overlayTexture));
  let uv = overlayUv(input.worldPosition.xy);
  let coords = clamp(vec2<i32>(floor(uv * vec2<f32>(dims))), vec2<i32>(0), dims - vec2<i32>(1));
  let color = textureLoad(overlayTexture, coords, 0);
  return vec4<f32>(color.rgb, 1.0);
}
