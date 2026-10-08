@group(0) @binding(0) var<uniform> modelView: mat4x4f;
@group(0) @binding(1) var<uniform> projection: mat4x4f;
@group(0) @binding(2) var<uniform> zIndex: f32;
@group(1) @binding(0) var<uniform> widthOverride: f32;
@group(1) @binding(1) var<storage, read> adjacency: array<PolylineAdjacency>;

struct VSOut {
    @builtin(position) position: vec4f,
    @location(0) color: vec3f,
    @location(1) skipped: f32,
};

@vertex
fn main(
    @builtin(vertex_index) vertexIndex: u32,
    @location(0) center: vec2f,
    @location(4) defaultWidth: f32,
    @location(5) objectId: vec3f,
    @location(8) skipped: f32,
) -> VSOut {
    let width = select(defaultWidth, widthOverride, widthOverride > 0.0);
    let node = adjacency[vertexIndex / 5u];
    let position = expandPolyline(center, node.previous, node.next, polylineSideRole(vertexIndex), width);
    var out: VSOut;
    out.position = projection * modelView * vec4f(position, zIndex, 1.0);
    out.color = objectId;
    out.skipped = skipped;
    return out;
}
