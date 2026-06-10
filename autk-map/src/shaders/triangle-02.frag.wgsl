@group(0) @binding(0) var<uniform> color : vec4f;
@group(0) @binding(6) var<uniform> opacity : f32;

@fragment
fn main(@location(0) inSkipped: f32) -> @location(0) vec4f {
    if (inSkipped > 0.0) {
        discard;
    }

    let outColor = vec4f(color.r / 255.0, color.g / 255.0, color.b / 255.0, color.a);
    return vec4f(outColor.rgb * opacity, opacity);
}
