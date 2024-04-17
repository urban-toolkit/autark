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

    var color: vec4f = vec4f(0.0, 0.0, 0.0, 1.0);
    if (showThematic > 0) {
        color = textureSample(cMapTex, cMapSampler, vec2f(inThematic, 0.0));
    }
    else {
        color = vec4f(color.r / 255, color.g / 255, color.b / 255, color.a);
    }

    var shade: vec4f = color * (diffuse + ambient);
    return vec4f(0.6 * shade + 0.4 * color);
}