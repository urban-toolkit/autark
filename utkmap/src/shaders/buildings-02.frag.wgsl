fn rand(n: f32) -> f32 { return fract(sin(n) * 43758.5453123); }

@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var colorTex: texture_2d<f32>;
@group(0) @binding(2) var normalTex: texture_2d<f32>;

@fragment  
fn main(@location(0) uvs : vec2<f32>) -> @location(0) vec4f { 

   var sss = 0.0;
   var n0 = normalize(textureSample(normalTex, texSampler, uvs ).xyz * 2.0 - 1.0);
   let num = 65;
   for(var i: i32 = 0; i < num; i = i + 1) 
   {
       var off  = f32(i);
       var dd = 0.0001;
       if ( i % 5  == 0 ) { dd = 0.0001; };
       if ( i % 10 == 0 ) { dd = 0.0002; };
       let sx = (1.0 - rand(off ) )*dd;
       let sy = (1.0 - rand(off*2000.0) )*dd;
       

       var n1 = normalize(textureSample(normalTex, texSampler, uvs+vec2<f32>(sx,sy) ).xyz * 2.0 - 1.0);
       sss = sss + dot(n0,n1);
   }
   let fr = 1.0/f32(num);
   let cc = 1.0 - clamp( (1.0 - sss*fr)*520.2, 0.0, 1.0);

   let originalColor: vec4f = textureSample(colorTex, texSampler, uvs );
   return vec4f( originalColor.rgb * cc, originalColor.a);
}