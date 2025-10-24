@group(1) @binding(0) var<uniform> modelView: mat4x4f;
@group(1) @binding(1) var<uniform> projection: mat4x4f;

struct VSOut {
    @builtin(position) outPosition: vec4<f32>,
    @location(0) outTexCoord: vec2<f32>,
 };

@vertex
fn main(@location(0) inPosition: vec3f, @location(1) inTexCoord: vec2f) -> VSOut {
    var vsOut: VSOut;

    vsOut.outPosition = projection * modelView * vec4f(inPosition, 1);
    vsOut.outTexCoord = inTexCoord;

    return vsOut;
}
