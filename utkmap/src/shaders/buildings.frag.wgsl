@group(0) @binding(0) var<uniform> color : vec4f;
@group(0) @binding(1) var<uniform> showThematic : f32;
@group(0) @binding(2) var cMapTex : texture_2d<f32>;
@group(0) @binding(3) var cMapSampler : sampler;

@fragment 
fn main(@location(0) inNormal: vec3f, @location(1) inThematic: f32) -> @location(0) vec4f {
    var light: vec3f = normalize(vec3f(1.0, 0.0, 1.0));
    var normal: vec3f = normalize(inNormal);

    var diffuse: f32 = max(dot(normal, light) * 0.7, 0.0);
    var ambient: f32 = 0.25;

    var finalcolor: vec4f = vec4f(0.0, 0.0, 0.0, 1.0);
    if (showThematic > 0) {
        finalcolor = textureSample(cMapTex, cMapSampler, vec2f(inThematic, 0.0));
    }
    else {
        finalcolor = vec4f(color.r / 255, color.g / 255, color.b / 255, color.a);
    }

    var shade: vec4f = finalcolor * (diffuse + ambient);
    return vec4f(0.5 * shade.rgb + 0.5 * finalcolor.rgb, 1.0);
}