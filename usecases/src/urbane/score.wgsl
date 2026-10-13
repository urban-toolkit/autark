// vals: normalized indicator values (arrest/noise already inverted).
// weights: one user weight per indicator, including sky exposure.
var score = 0.0;
for (var i = 0u; i < vals_length; i++) {
    score += vals[i] * weights[i];
}
return score;
