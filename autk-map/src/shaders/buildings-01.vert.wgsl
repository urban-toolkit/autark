@group(1) @binding(0) var<uniform> modelView: mat4x4f;
@group(1) @binding(1) var<uniform> projection: mat4x4f;
@group(1) @binding(2) var<uniform> zIndex: f32;

struct VSOut {
    @builtin(position) outPosition: vec4<f32>,
    @location(0) outNormal: vec3<f32>,
    @location(1) outThematic: f32,
    @location(2) outHighlighted: f32,
    @location(3) outThematicValid: f32,
    @location(4) outSkipped: f32
 };

@vertex
fn main(@location(0) inPosition: vec3f, @location(1) inNormal: vec3f, @location(2) inThematic: f32, @location(3) inHighlighted: f32, @location(4) inThematicValid: f32, @location(5) inSkipped: f32) -> VSOut {
    var vsOut: VSOut;

    vsOut.outPosition = projection * modelView * vec4f(inPosition.x, inPosition.y, inPosition.z + zIndex, 1);
    vsOut.outNormal = inNormal;
    vsOut.outThematic = inThematic;
    vsOut.outHighlighted = inHighlighted;
    vsOut.outThematicValid = inThematicValid;
    vsOut.outSkipped = inSkipped;

    return vsOut;
}
