fn rand(n: f32) -> f32 { return fract(sin(n) * 43758.5453123); }

@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var colorTex: texture_2d<f32>;
@group(0) @binding(2) var normalTex: texture_2d<f32>;

@fragment  
fn main(@location(0) uvs : vec2<f32>) -> @location(0) vec4f { 
    var fuvs = vec2f(uvs.x, 1.0 - uvs.y);

    var sss = 0.0;
    var n0 = normalize(textureSample(normalTex, texSampler, fuvs ).xyz * 2.0 - 1.0);
    let num = 32;
    for(var i: i32 = 0; i < num; i = i + 1) 
    {
        var off  = f32(i);
        var dd = 0.0001;
        if ( i % 5  == 0 ) { dd = 0.001; };
        if ( i % 10 == 0 ) { dd = 0.002; };
        let sx = (1.0 - rand(off) ) * dd;
        let sy = (1.0 - rand(off*2000.0) ) * dd;
        

        var n1 = normalize(textureSample(normalTex, texSampler, fuvs + vec2<f32>(sx,sy) ).xyz * 2.0 - 1.0);
        sss = sss + dot(n0,n1);
    }
    let fr = 1.0/f32(num);
    let cc = clamp( (sss * fr), 0.5, 1.0);

    let color = textureSample(colorTex, texSampler, fuvs );

    return vec4<f32>( cc * color.rgb, color.a);
    // return textureSample(normalTex, texSampler, fuvs);
}