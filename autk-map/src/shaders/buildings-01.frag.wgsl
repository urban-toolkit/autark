@group(0) @binding(0) var<uniform> color : vec4f;
@group(0) @binding(1) var<uniform> highlightColor : vec4f;
@group(0) @binding(2) var<uniform> showThematic : f32;
@group(0) @binding(3) var<uniform> showHighlight : f32;
@group(0) @binding(4) var cMapTex : texture_2d<f32>;
@group(0) @binding(5) var cMapSampler : sampler;
@group(0) @binding(6) var<uniform> opacity : f32;

struct BufferOut {
    @location(0) color  : vec4f,
    @location(1) normal : vec4f,
}

@fragment 
fn main(@location(0) inNormal: vec3f, @location(1) inThematic: f32, @location(2) inHighlighted: f32, @location(3) inSkipped: f32) -> BufferOut {

    if (inSkipped > 0.0) {
        discard;
    }

    var light1: vec3f = normalize(vec3f(1.0, 0.0, 1.0));
    var light2: vec3f = normalize(vec3f(0.0, 1.0, 0.0));

    var normal: vec3f = normalize(inNormal);

    var diffuse: f32 = 0.7 * max(dot(normal, light1) * 0.7, 0.0) + 0.3 * max(dot(normal, light2) * 0.7, 0.0);
    var ambient: f32 = 0.5;

    // var finalcolor: vec4f = vec4f(0.0, 0.0, 0.0, 1.0);
    var color = vec4f(color.r / 255, color.g / 255, color.b / 255, color.a);
    var sampledColor = textureSample(cMapTex, cMapSampler, vec2f(inThematic, 0.0));

    if(showHighlight > 0 && inHighlighted > 0) {
        color = highlightColor;
    }
    else if (showThematic > 0) {
        color = sampledColor;
    }

    var shade: vec4f = color * (diffuse + ambient);

    var output : BufferOut;
    output.color  = vec4f(0.5 * shade.rgb + 0.5 * color.rgb, 1.0);
    output.normal = vec4f(normal * 0.5 + 0.5, 1.0);

    return output;
}