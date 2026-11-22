/** Sum only edges within individual lines, even when a road has several parts. */
export const ROAD_LENGTH_WGSL = `
var total = 0.0;
for (var n = road.index; n < road.next; n++) {
    let line = road_node(n);
    if line.kind != 3u { continue; } // LineString
    for (var i = line.pointStart; i + 1u < line.pointEnd; i++) {
        total += distance(road_points[i].xy, road_points[i + 1u].xy);
    }
}
return total;
`.trim();
