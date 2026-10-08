@group(1) @binding(0) var<uniform> modelView: mat4x4f;
@group(1) @binding(1) var<uniform> projection: mat4x4f;
@group(1) @binding(2) var<uniform> zIndex: f32;
@group(2) @binding(0) var<uniform> widthOverride: f32;
@group(2) @binding(1) var<storage, read> adjacency: array<PolylineAdjacency>;

struct VSOut {
    @builtin(position) outPosition: vec4f,
    @location(0) outThematic: f32,
    @location(1) outHighlighted: f32,
    @location(2) outThematicValid: f32,
    @location(3) outSkipped: f32,
};

@vertex
fn main(
    @builtin(vertex_index) vertexIndex: u32,
    @location(0) center: vec2f,
    @location(4) defaultWidth: f32,
    @location(5) thematic: f32,
    @location(6) highlighted: f32,
    @location(7) thematicValid: f32,
    @location(8) skipped: f32,
) -> VSOut {
    let width = select(defaultWidth, widthOverride, widthOverride > 0.0);
    let node = adjacency[vertexIndex / 5u];
    let position = expandPolyline(center, node.previous, node.next, polylineSideRole(vertexIndex), width);
    var out: VSOut;
    out.outPosition = projection * modelView * vec4f(position, zIndex, 1.0);
    out.outThematic = thematic;
    out.outHighlighted = highlighted;
    out.outThematicValid = thematicValid;
    out.outSkipped = skipped;
    return out;
}
