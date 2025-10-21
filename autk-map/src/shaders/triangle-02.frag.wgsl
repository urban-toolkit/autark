@fragment
fn main(@location(0) inSkipped: f32) -> @location(0) vec4f {
    if (inSkipped > 0.0) {
        discard;
    }

    return vec4f(0.0, 0.0, 0.0, 1.0); // solid black
}