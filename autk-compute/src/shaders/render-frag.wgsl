@group(1) @binding(0) var<uniform> idColor: vec4f;
@fragment
fn main() -> @location(0) vec4f {
    return idColor;
}
