@group(1) @binding(0) var<uniform> modelView: mat4x4f;
@group(1) @binding(1) var<uniform> projection: mat4x4f;

struct TerrainUniform {
    heightOriginCell: vec4<f32>,
    heightDimsEnabled: vec4<f32>,
};

@group(2) @binding(0) var<uniform> terrain: TerrainUniform;
@group(2) @binding(1) var terrainHeightTexture: texture_2d<f32>;

struct VSOut {
    @builtin(position) outPosition: vec4<f32>,
    @location(0) outNormal: vec3<f32>,
    @location(1) outThematic: f32,
    @location(2) outHighlighted: f32,
    @location(3) outThematicValid: f32,
    @location(4) outSkipped: f32
 };

fn terrainHeight(xy: vec2<f32>) -> f32 {
    if (terrain.heightDimsEnabled.z < 0.5) {
        return 0.0;
    }

    let origin = terrain.heightOriginCell.xy;
    let cellSize = terrain.heightOriginCell.zw;
    let dims = vec2<i32>(i32(terrain.heightDimsEnabled.x), i32(terrain.heightDimsEnabled.y));
    let texel = clamp((xy - origin) / cellSize, vec2<f32>(0.0), vec2<f32>(f32(dims.x - 2), f32(dims.y - 2)));
    let base = vec2<i32>(floor(texel));
    let blend = fract(texel);
    let h00 = textureLoad(terrainHeightTexture, base, 0).r;
    let h10 = textureLoad(terrainHeightTexture, base + vec2<i32>(1, 0), 0).r;
    let h01 = textureLoad(terrainHeightTexture, base + vec2<i32>(0, 1), 0).r;
    let h11 = textureLoad(terrainHeightTexture, base + vec2<i32>(1, 1), 0).r;

    return mix(mix(h00, h10, blend.x), mix(h01, h11, blend.x), blend.y);
}

@vertex
fn main(@location(0) inPosition: vec3f, @location(1) inNormal: vec3f, @location(2) inThematic: f32, @location(3) inHighlighted: f32, @location(4) inThematicValid: f32, @location(5) inSkipped: f32) -> VSOut {
    var vsOut: VSOut;

    let terrainZ = terrainHeight(inPosition.xy);
    vsOut.outPosition = projection * modelView * vec4f(inPosition.x, inPosition.y, inPosition.z + terrainZ, 1);
    vsOut.outNormal = inNormal;
    vsOut.outThematic = inThematic;
    vsOut.outHighlighted = inHighlighted;
    vsOut.outThematicValid = inThematicValid;
    vsOut.outSkipped = inSkipped;

    return vsOut;
}
