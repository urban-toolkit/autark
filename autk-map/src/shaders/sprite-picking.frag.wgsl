@fragment
fn main(@location(0) color: vec3<f32>, @location(1) local: vec2<f32>) -> @location(0) vec4<f32> {
    if (all(color == vec3<f32>(0.0)) || dot(local, local) > 1.0) {
        discard;
    }
    return vec4<f32>(color, 1.0);
}
