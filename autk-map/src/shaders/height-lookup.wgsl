// Shared terrain height lookup. Included by every shader that reads terrain heights.
//
// The including shader declares, with its own @group/@binding:
//   var<uniform> terrainHeights: TerrainHeights;
//   var terrainHeightTexture: texture_2d_array<f32>;
// The uniform is packed by `packHeightUniform` (height-source.ts), whose CPU twin
// `heightAt` must stay in step with `terrainHeight` below.
// MAX_HEIGHT_LEVELS in height-source.ts must equal the array length here.

struct HeightLevel {
    // origin x, origin y, cell size x, cell size y
    originCell: vec4<f32>,
    // width, height (samples), unused, unused
    dims: vec4<f32>,
};

struct TerrainHeights {
    // level count, enabled (0 or 1), unused, unused
    header: vec4<f32>,
    levels: array<HeightLevel, 8>,
};

// Fraction of a window's width, measured inward from its edge, over which its
// heights blend into the next coarser level. Keep equal to HEIGHT_BLEND_BAND in height-source.ts.
const HEIGHT_BLEND_BAND: f32 = 0.125;

// How much of a level to use at a point: 0 on and outside the edge of its window,
// rising smoothly to 1 at HEIGHT_BLEND_BAND of the width inside it.
fn heightLevelWeight(level: HeightLevel, xy: vec2<f32>) -> f32 {
    let texel = (xy - level.originCell.xy) / level.originCell.zw;
    let inside = min(texel, level.dims.xy - vec2<f32>(1.0) - texel);
    let edge = min(inside.x, inside.y);
    let band = max(max(level.dims.x, level.dims.y) * HEIGHT_BLEND_BAND, 1.0);
    let t = clamp(edge / band, 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
}

fn sampleHeightLevel(index: i32, xy: vec2<f32>) -> f32 {
    let level = terrainHeights.levels[index];
    let dims = vec2<i32>(i32(level.dims.x), i32(level.dims.y));
    let texel = clamp((xy - level.originCell.xy) / level.originCell.zw, vec2<f32>(0.0), vec2<f32>(f32(dims.x - 2), f32(dims.y - 2)));
    let base = vec2<i32>(floor(texel));
    let blend = fract(texel);
    let h00 = textureLoad(terrainHeightTexture, base, index, 0).r;
    let h10 = textureLoad(terrainHeightTexture, base + vec2<i32>(1, 0), index, 0).r;
    let h01 = textureLoad(terrainHeightTexture, base + vec2<i32>(0, 1), index, 0).r;
    let h11 = textureLoad(terrainHeightTexture, base + vec2<i32>(1, 1), index, 0).r;

    return mix(mix(h00, h10, blend.x), mix(h01, h11, blend.x), blend.y);
}

// Height at a local-space point: the finest level whose window contains it,
// blended toward the next coarser level near the window's edge so levels meet
// without a step; the coarsest level (clamped to its edge) when none does.
// Zero when disabled.
fn terrainHeight(xy: vec2<f32>) -> f32 {
    if (terrainHeights.header.y < 0.5) {
        return 0.0;
    }

    let count = i32(terrainHeights.header.x);
    for (var i = 0; i < count - 1; i = i + 1) {
        let weight = heightLevelWeight(terrainHeights.levels[i], xy);
        if (weight > 0.0) {
            let fine = sampleHeightLevel(i, xy);
            if (weight >= 1.0) {
                return fine;
            }
            return mix(sampleHeightLevel(i + 1, xy), fine, weight);
        }
    }
    return sampleHeightLevel(count - 1, xy);
}
