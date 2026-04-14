struct Params {
    gridSize  : u32,
    tileSize  : u32,
    totalTiles: u32,
    _pad      : u32,
    clearR    : f32,
    clearG    : f32,
    clearB    : f32,
    clearA    : f32,
}
@group(0) @binding(0) var tiledTex : texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> results: array<atomic<u32>>;
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
    let ti = gid.z;
    if ti >= params.totalTiles { return; }
    if gid.x >= params.tileSize || gid.y >= params.tileSize { return; }

    let col = ti % params.gridSize;
    let row = ti / params.gridSize;
    let px  = col * params.tileSize + gid.x;
    let py  = row * params.tileSize + gid.y;

    let pixel = textureLoad(tiledTex, vec2u(px, py), 0);
    let isSky =
        abs(pixel.r - params.clearR) < 0.01 &&
        abs(pixel.g - params.clearG) < 0.01 &&
        abs(pixel.b - params.clearB) < 0.01 &&
        abs(pixel.a - params.clearA) < 0.01;

    if !isSky {
        atomicAdd(&results[ti], 1u);
    }
}
