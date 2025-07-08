@group(0) @binding(0) var<uniform> modelView: mat4x4f;
@group(0) @binding(1) var<uniform> projection: mat4x4f;

struct VSOut {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec3<f32>,
 };

@vertex
fn main(@builtin(vertex_index) i: u32, @location(0) inPosition: vec3f, @location(1) objectId: vec3<f32>) -> VSOut {
    var vsOut: VSOut;
    vsOut.position = projection * modelView * vec4f(inPosition, 1);
    vsOut.color = objectId;

    return vsOut;
}