@group(1) @binding(0) var<uniform> modelView: mat4x4f;
@group(1) @binding(1) var<uniform> projection: mat4x4f;

@vertex
fn main(@location(0) position: vec3f) -> @builtin(position) vec4f {
    return projection * modelView * vec4f(position, 1);
}