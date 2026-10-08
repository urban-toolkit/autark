struct FSIn {
    @location(0) color: vec3f,
    @location(1) skipped: f32,
};

@fragment
fn main(in: FSIn) -> @location(0) vec4f {
    if (in.skipped > 0.5) { discard; }
    return vec4f(in.color, 1.0);
}
