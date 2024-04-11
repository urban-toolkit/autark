struct VSOut {
    @builtin(position) outPosition: vec4f,
    @location(0) outThematic: f32,
 };

@vertex
fn main(@location(0) inPosition: vec3f, @location(1) inThematic: f32) -> VSOut {
    var vsOut: VSOut;

    vsOut.outPosition = vec4f(inPosition, 1);
    vsOut.outThematic = inThematic;

    return vsOut;
}