// OLS: temperature = slope * yearIndex + intercept, yearIndex = 0..23.
// out[0]: atan(slope) in degrees (not the slope in °C/year).
// out[1]: fitted temperature at yearIndex = 0 (2001).
var n = f32(bands_length);
var sum_x = 0.0;
var sum_y = 0.0;
var sum_xy = 0.0;
var sum_x2 = 0.0;

for (var i = 0u; i < bands_length; i++) {
    let x = f32(i);
    let y = bands[i];
    sum_x += x;
    sum_y += y;
    sum_xy += x * y;
    sum_x2 += x * x;
}

let denom = n * sum_x2 - sum_x * sum_x;
var slope = 0.0;
var intercept = 0.0;
if (denom != 0.0) {
    slope = (n * sum_xy - sum_x * sum_y) / denom;
    intercept = (sum_y - slope * sum_x) / n;
}

var out: OutputArray;
out[0] = atan(slope) * (180.0 / 3.14159265358979);
out[1] = intercept;
return out;
