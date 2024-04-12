struct Mats {
  modelView: mat4x4<f32>,
  projection: mat4x4<f32>,
};

@group(1) @binding(0) var<uniform> mats: Mats;

struct VSOut {
    @builtin(position) outPosition: vec4f,
    @location(0) outThematic: f32,
 };

@vertex
fn main(@location(0) inPosition: vec3f, @location(1) inThematic: f32) -> VSOut {
    var vsOut: VSOut;

    vsOut.outPosition =  mats.projection * mats.modelView * vec4f(inPosition, 1);
    vsOut.outThematic = inThematic;

    return vsOut;
}