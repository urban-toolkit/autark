@group(1) @binding(0) var<uniform> modelView: mat4x4f;
@group(1) @binding(1) var<uniform> projection: mat4x4f;
@group(1) @binding(2) var<uniform> zIndex: f32;

struct VSOut {
    @builtin(position) outPosition: vec4<f32>,
    @location(0) outSkipped: f32
 };

@vertex
fn main(@location(0) inPosition: vec2f, @location(3) inSkipped: f32) -> VSOut {
    var vsOut: VSOut;

    vsOut.outPosition = projection * modelView * vec4f(inPosition.x, inPosition.y, zIndex, 1);
    vsOut.outSkipped = inSkipped;

    return vsOut;
}