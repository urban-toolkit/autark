struct VSOut {
    @builtin(position) Position: vec4<f32>,
    @location(0) uvs : vec2<f32>,
};

@vertex 
fn main(@builtin(vertex_index) VertexIndex : u32) -> VSOut {
 
    var pos = array( 
        vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0),
        vec2(-1.0,  1.0), vec2(1.0, -1.0), vec2( 1.0, 1.0),
    );

    var vsOut: VSOut;
    vsOut.Position = vec4<f32>(pos[VertexIndex], 0.0, 1.0);
    vsOut.uvs = (pos[VertexIndex] + 1.0) * 0.5;

    return vsOut;
}