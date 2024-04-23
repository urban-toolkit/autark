@group(0) @binding(0) var<uniform> color : vec4f;
@group(0) @binding(1) var<uniform> showThematic : f32;
@group(0) @binding(2) var cMapTex : texture_2d<f32>;
@group(0) @binding(3) var cMapSampler : sampler;

struct BufferOut {
    @location(0) color  : vec4f,
    @location(1) normal : vec4f,
}

@fragment 
fn main(@location(0) inNormal: vec3f, @location(1) inThematic: f32) -> BufferOut {
    var light1: vec3f = normalize(vec3f(1.0, 0.0, 1.0));
    var light2: vec3f = normalize(vec3f(0.0, 1.0, 0.0));

    var normal: vec3f = normalize(inNormal);

    var diffuse: f32 = 0.7 * max(dot(normal, light1) * 0.7, 0.0) + 0.3 * max(dot(normal, light2) * 0.7, 0.0);
    var ambient: f32 = 0.5;

    var finalcolor: vec4f = vec4f(0.0, 0.0, 0.0, 1.0);
    if (showThematic > 0) {
        finalcolor = textureSample(cMapTex, cMapSampler, vec2f(inThematic, 0.0));
    }
    else {
        finalcolor = vec4f(color.r / 255, color.g / 255, color.b / 255, color.a);
    }
    var shade: vec4f = finalcolor * (diffuse + ambient);

    var output : BufferOut;
    output.color  = vec4f(0.5 * shade.rgb + 0.5 * finalcolor.rgb, 1.0);
    output.normal = vec4f(normal * 0.5 + 0.5, 1.0);

    return output;

}