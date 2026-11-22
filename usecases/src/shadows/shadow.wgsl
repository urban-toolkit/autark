// ── Hourly daylight-sampled shadow estimate + building contribution %, Chicago ──
// out[0] — accumulated shadow minutes (each hourly sample contributes 60 min).
// out[1] — contribution %: (accumulated / sjoin_avg) * 100.
// Interpretation assumes the baseline CSV's units are also minutes (see README).
// bld_height, doy, ring are global variables (same for all road segments).
// road and sjoin_avg are per-feature inputs.
let pi      = 3.14159265359;
let lat_rad = 0.73027;    // 41.85° N
let lon_ref = -75.0;      // reference meridian (CDT, UTC-5)
let lon_loc = -87.65;     // Chicago longitude

let dec_rad = -0.40928 * cos(2.0 * pi / 365.0 * (doy + 10.0));

// ── Pass 1: find first and last hour with sun above the horizon ───────────────
var first_valid = -1i;
var last_valid  = -1i;
for (var hour = 5i; hour <= 21i; hour++) {
    let st  = f32(hour) + (lon_ref - lon_loc) / 15.0;
    let hr  = (st - 12.0) * pi / 12.0;
    let sa  = sin(lat_rad) * sin(dec_rad) + cos(lat_rad) * cos(dec_rad) * cos(hr);
    if asin(clamp(sa, -1.0, 1.0)) > 0.0 {
        if first_valid < 0i { first_valid = hour; }
        last_valid = hour;
    }
}

var accumulated: f32 = 0.0;

// ── Pass 2: accumulate interior hours only (skip first and last above horizon) ─
for (var hour = 5i; hour <= 21i; hour++) {
    if hour <= first_valid + 1i || hour >= last_valid - 1i { continue; }
    let solar_time = f32(hour) + (lon_ref - lon_loc) / 15.0;
    let h_rad      = (solar_time - 12.0) * pi / 12.0;

    let sin_alt = sin(lat_rad) * sin(dec_rad)
                + cos(lat_rad) * cos(dec_rad) * cos(h_rad);
    let alt_rad = asin(clamp(sin_alt, -1.0, 1.0));

    if alt_rad <= 0.0 { continue; }

    let az_rad = atan2(
        sin(h_rad),
        sin(lat_rad) * cos(h_rad) - cos(lat_rad) * tan(dec_rad)
    ) + pi;

    let sdx = -sin(az_rad);
    let sdy = -cos(az_rad);
    let shadow_len = bld_height / tan(alt_rad);

    // Shadow-aligned OBB axes
    let perp_x = sdy;
    let perp_y = -sdx;

    // ── Exact OBB from ALL ring vertices ──────────────────────────────────────
    var u_lo: f32 =  1e30;
    var u_hi: f32 = -1e30;
    var v_lo: f32 =  1e30;
    var v_hi: f32 = -1e30;

    for (var ri = 0u; ri < ring_rows; ri++) {
        let rx = ring[ri * 2u];
        let ry = ring[ri * 2u + 1u];
        let ru = rx * perp_x + ry * perp_y;
        let rv = rx * sdx    + ry * sdy;
        u_lo = min(u_lo, ru);
        u_hi = max(u_hi, ru);
        v_lo = min(v_lo, rv);
        v_hi = max(v_hi, rv);
    }

    let v_hi_shadow = v_hi + shadow_len;

    // Check edges within each LineString, never between separate parts.
    let u_axis = vec2f(perp_x, perp_y);
    let v_axis = vec2f(sdx, sdy);
    var hit = false;
    for (var n = road.index; n < road.next && !hit; n++) {
        let line = road_node(n);
        if line.kind != 3u { continue; } // LineString
        for (var i = line.pointStart; i + 1u < line.pointEnd && !hit; i++) {
            let a = road_points[i].xy;
            let b = road_points[i + 1u].xy;
            let au = dot(a, u_axis); let av = dot(a, v_axis);
            let bu = dot(b, u_axis); let bv = dot(b, v_axis);
            if max(au, bu) < u_lo || min(au, bu) > u_hi ||
               max(av, bv) < v_lo || min(av, bv) > v_hi_shadow { continue; }
            let du = bu - au;
            if abs(du) > 0.001 {
                let t0 = (u_lo - au) / du;
                let t1 = (u_hi - au) / du;
                let t_enter = max(min(t0, t1), 0.0);
                let t_exit = min(max(t0, t1), 1.0);
                let v_enter = mix(av, bv, t_enter);
                let v_exit = mix(av, bv, t_exit);
                hit = t_enter <= t_exit && max(v_enter, v_exit) >= v_lo && min(v_enter, v_exit) <= v_hi_shadow;
            } else {
                hit = true;
            }
        }
    }

    if hit { accumulated += 60.0; }
}

var out: OutputArray;
out[0] = accumulated;
out[1] = select(0.0, (accumulated / sjoin_avg) * 100.0, sjoin_avg > 0.0);
return out;
