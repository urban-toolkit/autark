@group(0) @binding(0) var<uniform> viewProj: mat4x4f;
@vertex
fn main(@location(0) pos: vec3f) -> @builtin(position) vec4f {
    return viewProj * vec4f(pos, 1.0);
}
