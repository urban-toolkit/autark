@group(0) @binding(0) var<uniform> color : vec4f;
@group(0) @binding(1) var<uniform> highlightColor : vec4f;
@group(0) @binding(2) var<uniform> showThematic : f32;
@group(0) @binding(3) var<uniform> showHighlight : f32;
@group(0) @binding(4) var cMapTex : texture_2d<f32>;
@group(0) @binding(5) var cMapSampler : sampler;
@group(0) @binding(6) var<uniform> opacity : f32;

@fragment 
fn main(@location(0) inThematic: f32, @location(1) inHighlighted: f32, @location(2) inSkipped: f32) -> @location(0) vec4f {

    if (inSkipped > 0.0) {
        discard;
    }

    var color = vec4f(color.r / 255, color.g / 255, color.b / 255, color.a);
    var sampledColor = textureSample(cMapTex, cMapSampler, vec2f(inThematic, 0.0));

    if(showHighlight > 0 && inHighlighted > 0) {
        color = vec4f(highlightColor.r / 255, highlightColor.g / 255, highlightColor.b / 255, highlightColor.a);
    }
    else if (showThematic > 0) {
        color = sampledColor;
    }
    return vec4f(color.rgb * opacity, opacity);
}