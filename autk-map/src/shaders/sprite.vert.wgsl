@group(1) @binding(0) var<uniform> modelView: mat4x4f;
@group(1) @binding(1) var<uniform> projection: mat4x4f;
@group(2) @binding(0) var<uniform> pointSize: f32;

struct VSOut {
    @builtin(position) outPosition: vec4<f32>,
    @location(0) outLocal: vec2<f32>,
    @location(1) outThematic: f32,
    @location(2) outHighlighted: f32,
    @location(3) outThematicValid: f32,
    @location(4) outSkipped: f32,
 };

@vertex
fn main(
    @location(0) inLocal: vec2f,
    @location(1) inCenter: vec2f,
    @location(2) inThematic: f32,
    @location(3) inHighlighted: f32,
    @location(4) inThematicValid: f32,
    @location(5) inSkipped: f32,
) -> VSOut {
    var vsOut: VSOut;
    let worldPosition = inCenter + inLocal * pointSize;

    vsOut.outPosition = projection * modelView * vec4f(worldPosition.x, worldPosition.y, 0.0, 1.0);
    vsOut.outLocal = inLocal;
    vsOut.outThematic = inThematic;
    vsOut.outHighlighted = inHighlighted;
    vsOut.outThematicValid = inThematicValid;
    vsOut.outSkipped = inSkipped;

    return vsOut;
}
