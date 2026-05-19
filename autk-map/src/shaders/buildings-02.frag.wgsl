fn rand(n: f32) -> f32 { return fract(sin(n) * 43758.5453123); }

@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var colorTex: texture_2d<f32>;
@group(0) @binding(2) var normalTex: texture_2d<f32>;

@fragment
fn main(@location(0) uvs : vec2<f32>) -> @location(0) vec4f {
    var fuvs = vec2f(uvs.x, 1.0 - uvs.y);

    var n0tex = textureSample(normalTex, texSampler, fuvs);
    var n0    = normalize(n0tex.xyz * 2.0 - 1.0);

    // --- AO ---
    // Small bidirectional radii keep the occlusion band to ~2-3 px.
    // Background samples (alpha == 0) are treated as open sky (no contribution).
    let num = 32;
    var sss = 0.0;
    for(var i: i32 = 0; i < num; i = i + 1)
    {
        var off = f32(i);
        var dd = 0.0003;
        if ( i % 5  == 0 ) { dd = 0.001; };
        if ( i % 10 == 0 ) { dd = 0.002; };
        let sx = (rand(off)        * 2.0 - 1.0) * dd;
        let sy = (rand(off*2000.0) * 2.0 - 1.0) * dd;

        var n1tex = textureSample(normalTex, texSampler, fuvs + vec2<f32>(sx, sy));

        if (n1tex.a > 0.0005) {
            var n1 = normalize(n1tex.xyz * 2.0 - 1.0);
            sss = sss + dot(n0, n1);
        } else {
            sss = sss + 1.0;
        }
    }

    let fr = 1.0 / f32(num);
    let cc = clamp( (sss * fr), 0.40, 1.0);

    let color = textureSample(colorTex, texSampler, fuvs);
    var result = cc * color.rgb;

return vec4<f32>(result, color.a);
}
