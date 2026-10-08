// Shared by visible and picking passes. Expansion is in local XY, before camera transforms.
struct PolylineAdjacency {
    previous: vec2f,
    next: vec2f,
};

// Each node owns incoming left/right, outgoing left/right, then a join-center vertex.
fn polylineSideRole(vertexIndex: u32) -> vec2f {
    let vertex = vertexIndex % 5u;
    if (vertex == 4u) { return vec2f(0.0); }
    let side = select(-1.0, 1.0, vertex % 2u == 0u);
    let role = select(-1.0, 1.0, vertex >= 2u);
    return vec2f(side, role);
}

fn expandPolyline(center: vec2f, previous: vec2f, next: vec2f, sideRole: vec2f, width: f32) -> vec2f {
    let side = sideRole.x;
    let role = sideRole.y;
    if (side == 0.0) { return center; }

    let before = center - previous;
    let after = next - center;
    let beforeLength = length(before);
    let afterLength = length(after);
    var incoming = before / select(1.0, beforeLength, beforeLength > 0.0);
    var outgoing = after / select(1.0, afterLength, afterLength > 0.0);
    if (beforeLength == 0.0) { incoming = outgoing; }
    if (afterLength == 0.0) { outgoing = incoming; }
    let incomingNormal = vec2f(-incoming.y, incoming.x);
    let outgoingNormal = vec2f(-outgoing.y, outgoing.x);
    let sum = incomingNormal + outgoingNormal;
    let sumLength = length(sum);

    // A miter extends at most four half-widths. Acute turns/reversals use bevel joins.
    if (sumLength > 0.000001) {
        let miter = sum / sumLength;
        let denominator = dot(miter, outgoingNormal);
        if (denominator >= 0.25) {
            return center + miter * (side * width * 0.5 / denominator);
        }
    }
    let normal = select(incomingNormal, outgoingNormal, role > 0.0);
    return center + normal * (side * width * 0.5);
}
