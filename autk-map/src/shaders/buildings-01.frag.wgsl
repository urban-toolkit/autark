@group(0) @binding(0) var<uniform> color : vec4f;
@group(0) @binding(1) var<uniform> highlightColor : vec4f;
@group(0) @binding(2) var<uniform> showThematic : f32;
@group(0) @binding(3) var<uniform> showHighlight : f32;
@group(0) @binding(4) var cMapTex : texture_2d<f32>;
@group(0) @binding(5) var cMapSampler : sampler;
@group(0) @binding(6) var<uniform> opacity : f32;
@group(0) @binding(7) var<uniform> domainParams : vec4f;

struct BufferOut {
    @location(0) color  : vec4f,
    @location(1) normal : vec4f,
}

@fragment
fn main(@builtin(position) fragPos: vec4f, @location(0) inNormal: vec3f, @location(1) inThematic: f32, @location(2) inHighlighted: f32, @location(3) inSkipped: f32) -> BufferOut {

    if (inSkipped > 0.0) {
        discard;
    }

    // 3-tone architectural lighting: top faces bright, lit walls mid, shadow walls dark.
    // Light from upper-front-right (Z up). Ambient sets the shadow-face floor (~60%).
    // Diffuse adds up to 40% on top/lit faces, giving a clear 60-100% range.
    var light: vec3f = normalize(vec3f(0.8, 0.5, 1.5));

    var normal: vec3f = normalize(inNormal);

    var diffuse: f32 = 0.28 * max(dot(normal, light), 0.0);
    var ambient: f32 = 0.62;

    var color = vec4f(color.r / 255, color.g / 255, color.b / 255, color.a);

    var thematicValue = inThematic;
    if (domainParams.z > 1.5) {
        let nCategories = domainParams.w;
        let denom = max(1.0, nCategories - 1.0);
        thematicValue = clamp(inThematic / denom, 0.0, 1.0);
    } else if (domainParams.z > 0.5) {
        let minVal = domainParams.x;
        let maxVal = domainParams.y;
        let range = maxVal - minVal;
        thematicValue = select(0.0, clamp((inThematic - minVal) / range, 0.0, 1.0), range > 0.0);
    }

    var sampledColor = textureSample(cMapTex, cMapSampler, vec2f(thematicValue, 0.0));

    if(showHighlight > 0 && inHighlighted > 0) {
        color = vec4f(highlightColor.r / 255, highlightColor.g / 255, highlightColor.b / 255, highlightColor.a);
    }
    else if (showThematic > 0) {
        color = sampledColor;
    }

    var shade: vec4f = color * (diffuse + ambient);

    var output : BufferOut;
    output.color  = vec4f(shade.rgb, 1.0);
    // Store depth in normal.a (mapped to [0.001, 0.999] so geometry is always > 0,
    // distinguishable from background which is cleared to 0.0).
    output.normal = vec4f(normal * 0.5 + 0.5, fragPos.z * 0.998 + 0.001);

    return output;
}
