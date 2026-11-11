@fragment
fn main(@location(0) color: vec3<f32>) -> @location(0) vec4<f32> {
    // Zero is the reserved no-hit ID. Hidden geometry must write neither color nor depth.
    if (all(color == vec3<f32>(0.0))) {
        discard;
    }

    return vec4<f32>(color, 1.0);
}
