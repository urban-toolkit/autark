@group(0) @binding(0) var<uniform> color : vec4f;
@group(0) @binding(1) var<uniform> showThematic : f32;
@group(0) @binding(2) var cMapTex : texture_2d<f32>;
@group(0) @binding(3) var cMapSampler : sampler;

@fragment 
fn main(@location(0) inThematic: f32, @location(1) inMat: vec4<f32>) -> @location(0) vec4f {
    var debug: f32 = 1.0;
    if(debug == 0.0) {
       return inMat;
    }

    if (showThematic > 0) {
        return textureSample(cMapTex, cMapSampler, vec2f(inThematic, 0.0));
    }
    else {
        return vec4f(color.r / 255, color.g / 255, color.b / 255, color.a);
    }
}