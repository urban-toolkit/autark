@group(0) @binding(6) var<uniform> opacity : f32;

@group(2) @binding(0) var rasterData : texture_2d<f32>;
@group(2) @binding(1) var rasterSampler : sampler;

@fragment 
fn main(@location(0) inTexCoord: vec2f) -> @location(0) vec4f {
    var color = textureSample(rasterData, rasterSampler, inTexCoord);

    return vec4f(color.rgb * opacity, color.a * opacity);
}