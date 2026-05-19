struct Params {
    gridSize   : u32,
    tileSize   : u32,
    totalTiles : u32,
    classCount : u32,
    objectCount: u32,
    flags      : u32,
    _pad0      : u32,
    _pad1      : u32,
}

@group(0) @binding(0) var tiledTex : texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> classResults: array<atomic<u32>>;
@group(0) @binding(2) var<storage, read_write> objectResults: array<atomic<u32>>;
@group(0) @binding(3) var<storage, read> sampleSources: array<u32>;
@group(0) @binding(4) var<uniform> params: Params;

fn decodeByte(value: f32) -> u32 {
    return u32(round(clamp(value, 0.0, 1.0) * 255.0));
}

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
    let sourceIndex = sampleSources[ti];

    if pixel.a < 0.5 {
        if (params.flags & 4u) != 0u && (params.flags & 1u) != 0u && params.classCount > 0u {
            atomicAdd(&classResults[sourceIndex * params.classCount + (params.classCount - 1u)], 1u);
        }
        return;
    }

    let classByte = decodeByte(pixel.r);
    if classByte == 0u { return; }
    let classIndex = classByte - 1u;

    if (params.flags & 1u) != 0u && classIndex < params.classCount {
        atomicAdd(&classResults[sourceIndex * params.classCount + classIndex], 1u);
    }

    let objectCode = decodeByte(pixel.g) + decodeByte(pixel.b) * 256u;
    if objectCode == 0u { return; }
    let objectIndex = objectCode - 1u;

    if (params.flags & 2u) != 0u && objectIndex < params.objectCount {
        atomicStore(&objectResults[ti * params.objectCount + objectIndex], 1u);
    }
}
