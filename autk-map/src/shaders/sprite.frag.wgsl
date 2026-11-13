@group(0) @binding(0) var<uniform> color : vec4f;
@group(0) @binding(1) var<uniform> highlightColor : vec4f;
@group(0) @binding(2) var<uniform> showThematic : f32;
@group(0) @binding(3) var<uniform> showHighlight : f32;
@group(0) @binding(4) var cMapTex : texture_2d<f32>;
@group(0) @binding(5) var cMapSampler : sampler;
@group(0) @binding(6) var<uniform> opacity : f32;
@group(0) @binding(7) var<uniform> domainParams : vec4f;
@group(0) @binding(8) var<uniform> invalidValueColor : vec4f;

@fragment
fn main(
    @location(0) inLocal: vec2<f32>,
    @location(1) inThematic: f32,
    @location(2) inHighlighted: f32,
    @location(3) inThematicValid: f32,
    @location(4) inSkipped: f32,
) -> @location(0) vec4f {
    if (dot(inLocal, inLocal) > 1.0) {
        discard;
    }

    if (inSkipped > 0.0) {
        discard;
    }

    var outColor = vec4f(color.r / 255.0, color.g / 255.0, color.b / 255.0, color.a);

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

    let sampledColor = textureSample(cMapTex, cMapSampler, vec2f(thematicValue, 0.0));

    // A highlighted feature is drawn opaque: at the layer's opacity it would fade with the layer, and could vanish.
    var drawOpacity = opacity;
    if (showHighlight > 0.0 && inHighlighted > 0.0) {
        outColor = vec4f(highlightColor.r / 255.0, highlightColor.g / 255.0, highlightColor.b / 255.0, highlightColor.a);
        drawOpacity = 1.0;
    } else if (showThematic > 0.0 && inThematicValid < 0.5) {
        outColor = vec4f(invalidValueColor.r / 255.0, invalidValueColor.g / 255.0, invalidValueColor.b / 255.0, invalidValueColor.a);
    } else if (showThematic > 0.0) {
        outColor = sampledColor;
    }

    return vec4f(outColor.rgb * drawOpacity, drawOpacity);
}
