import { Geo } from './geo.js';
export { ConeEngine };

// ConeEngine — the fracture cone: which tiles of a raft come with the one being dragged

class ConeEngine {

  static computeCone(n, tilt, angle) {
    const step = Geo.PI / n;
    const offsetAngle = angle - (tilt - Geo.PI);
    const index = Math.round(offsetAngle / step);
    const center = Geo.norm(tilt - Geo.PI + index * step);
    const isCorner = index % 2 === 0;

    return {
      centerAngle: center,
      halfSpan: isCorner ? step : Geo.TAU / n,
    };
  }

  // Which connected nodes lie inside the fracture cone, measured from the
  // dragged node's position at the moment the drag began.
  static walkGroup(mgr, dragNode, cone) {
    const origin = dragNode.state?.dragOrigin;
    if (!origin) return new Set([dragNode]);

    return mgr.walk(dragNode, (other) => {
      const at = other.node.state?.dragOrigin;
      if (!at) return false;
      const angle = Math.atan2(at.y - origin.y, at.x - origin.x);
      return Geo.adiff(cone.centerAngle, angle) <= cone.halfSpan + 0.01;
    });
  }
}
