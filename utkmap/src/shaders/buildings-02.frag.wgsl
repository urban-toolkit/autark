fn rand(n: f32) -> f32 { return fract(sin(n) * 43758.5453123); }

@group(0) @binding(0) var mySampler: sampler;
@group(0) @binding(1) var myTexture: texture_2d<f32>;

@fragment  
fn main(@location(0) uvs : vec2<f32>) -> @location(0) vec4<f32> { 
 //   return textureSample(myTexture, mySampler, uvs );
 //   return vec4<f32>(1.0, 0.0, 1.0, 1.0); 

 //   let n0 = textureSample(myTexture, mySampler, uvs ).xyz;
 //   return vec4<f32>(n0, 1.0);
 //   let normal = normalize(n0 * 2.0 - 1.0);
 //   return vec4<f32>(normal,1.0);

 //   let n0 = normalize( textureSample(myTexture, mySampler, uvs ).xyz * 2.0 - 1.0);
 //   return vec4<f32>( n0, 1.0);

   var sss = 0.0;
   var n0 = normalize(textureSample(myTexture, mySampler, uvs ).xyz * 2.0 - 1.0);
   let num = 65;
   for(var i: i32 = 0; i < num; i = i + 1) 
   {
       var off  = f32(i);
       var dd = 0.0001;
       if ( i % 5  == 0 ) { dd = 0.001; };
       if ( i % 10 == 0 ) { dd = 0.002; };
       let sx = (1.0 - rand(off ) )*dd;
       let sy = (1.0 - rand(off*2000.0) )*dd;
       

       var n1 = normalize(textureSample(myTexture, mySampler, uvs+vec2<f32>(sx,sy) ).xyz * 2.0 - 1.0);
       sss = sss + dot(n0,n1);
   }
   let fr = 1.0/f32(num);
   let cc = 1.0 - clamp( (1.0 - sss*fr)*520.2, 0.0, 1.0);

   return vec4<f32>( cc, cc, cc, 1.0);
}