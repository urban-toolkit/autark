@group(0) @binding(0) var<uniform> modelView: mat4x4f;
@group(0) @binding(1) var<uniform> projection: mat4x4f;
@group(1) @binding(0) var<uniform> pointSize: f32;

struct VSOut {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec3<f32>,
    @location(1) local: vec2<f32>,
 };

@vertex
fn main(
    @location(0) inLocal: vec2f,
    @location(1) inCenter: vec2f,
    @location(2) objectId: vec3<f32>,
) -> VSOut {
    var vsOut: VSOut;
    let worldPosition = inCenter + inLocal * pointSize;
    vsOut.position = projection * modelView * vec4f(worldPosition.x, worldPosition.y, 0.0, 1.0);
    vsOut.color = objectId;
    vsOut.local = inLocal;
    return vsOut;
}
