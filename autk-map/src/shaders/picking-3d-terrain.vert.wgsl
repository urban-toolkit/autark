@group(0) @binding(0) var<uniform> modelView: mat4x4f;
@group(0) @binding(1) var<uniform> projection: mat4x4f;

@group(1) @binding(0) var<uniform> terrainHeights: TerrainHeights;
@group(1) @binding(1) var terrainHeightTexture: texture_2d_array<f32>;

#include height-lookup.wgsl;

struct VSOut {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec3<f32>,
 };

@vertex
fn main(@location(0) inPosition: vec3f, @location(1) objectId: vec3<f32>) -> VSOut {
    var vsOut: VSOut;
    let terrainZ = terrainHeight(inPosition.xy);
    vsOut.position = projection * modelView * vec4f(inPosition.x, inPosition.y, inPosition.z + terrainZ, 1);
    vsOut.color = objectId;

    return vsOut;
}
