import { Vector2D } from '../2d-support/vector2d.js';
import { WarpedPolygon } from './warped-polygon.js';

class RoundedWarpedPolygon {
  static getTangentAway(p1, p2, bend, atP2) {
    if (!bend || Math.abs(bend) < 0.01) {
      if (atP2) {
        return p1.sub(p2).normalize();
      } else {
        return p2.sub(p1).normalize();
      }
    }
    const arcParams = WarpedPolygon._getArcParams(p1, p2, bend);
    if (!arcParams) {
      if (atP2) {
        return p1.sub(p2).normalize();
      } else {
        return p2.sub(p1).normalize();
      }
    }

    const { center, counterclockwise } = arcParams;
    let normal;
    if (atP2) {
      normal = p2.sub(center).normalize();
    } else {
      normal = p1.sub(center).normalize();
    }

    let tangent = normal.perpendicular();
    
    // SANITY CHECK: Ensure the tangent points generally toward the other point
    const target = atP2 ? p1 : p2;
    const toTarget = target.sub(atP2 ? p2 : p1);
    
    if (tangent.dot(toTarget) < 0) {
        tangent = tangent.scale(-1);
    }
    
    return tangent.normalize();
  }

  static calculateRoundedPolygon(corners, bends, radius = 5) {
    const l = corners.length;
    const processedCorners = [];

    for (let i = 0; i < l; i++) {
      const p_prev = corners[(i - 1 + l) % l];
      const p_curr = corners[i];
      const p_next = corners[(i + 1) % l];

      const bend_in = bends[(i - 1 + l) % l];
      const bend_out = bends[i];

      const t_in = this.getTangentAway(p_prev, p_curr, bend_in, true);
      const t_out = this.getTangentAway(p_curr, p_next, bend_out, false);

      const cross = t_in.cross(t_out);
      const dot = t_in.dot(t_out);
      let theta = Math.acos(Math.max(-1, Math.min(1, dot)));

      if (Math.abs(Math.PI - theta) < 0.01 || Math.abs(theta) < 0.01) {
        processedCorners.push({
          type: 'sharp',
          p: p_curr,
          bend_out: bend_out
        });
        continue;
      }

      const d_ideal = radius / Math.tan(theta / 2);

      let l_in = p_prev.distanceTo(p_curr);
      let l_out = p_curr.distanceTo(p_next);

      const d = Math.min(d_ideal, l_in / 2, l_out / 2);

      if (d < 0.1) {
        processedCorners.push({
          type: 'sharp',
          p: p_curr,
          bend_out: bend_out
        });
        continue;
      }

      const p_new_in = p_curr.add(t_in.scale(d));
      const p_new_out = p_curr.add(t_out.scale(d));

      const turn_angle = Math.PI - theta;
      const bend_arc = cross > 0 ? turn_angle : -turn_angle;

      processedCorners.push({
        type: 'rounded',
        p_in: p_new_in,
        p_out: p_new_out,
        bend_arc: bend_arc,
        bend_out: bend_out,
        original_p: p_curr
      });
    }

    const final_corners = [];
    const final_bends = [];

    for (let i = 0; i < l; i++) {
      const c = processedCorners[i];
      const c_next = processedCorners[(i + 1) % l];

      if (c.type === 'sharp') {
        final_corners.push(c.p);

        let new_bend_out = c.bend_out;
        if (c.bend_out && Math.abs(c.bend_out) >= 0.01) {
          const original_len = c.p.distanceTo(c_next.original_p || c_next.p);
          const p_start = c.p;
          const p_end = c_next.p_in || c_next.p;
          const new_len = p_start.distanceTo(p_end);
          new_bend_out = c.bend_out * (new_len / original_len);
        }
        final_bends.push(new_bend_out);
      } else {
        final_corners.push(c.p_in);
        final_bends.push(c.bend_arc);

        final_corners.push(c.p_out);

        let new_bend_out = c.bend_out;
        if (c.bend_out && Math.abs(c.bend_out) >= 0.01) {
          const original_len = c.original_p.distanceTo(c_next.original_p || c_next.p);
          const p_start = c.p_out;
          const p_end = c_next.p_in || c_next.p;
          const new_len = p_start.distanceTo(p_end);
          new_bend_out = c.bend_out * (new_len / original_len);
        }
        final_bends.push(new_bend_out);
      }
    }

    return { corners: final_corners, bends: final_bends };
  }

  static processGeoms(geoms, params)  {
    return geoms.map(g => {
      if (g.type === 'warpedpoly' || g.type === 'link') {
        const { corners, bends } = this.calculateRoundedPolygon(g.corners, g.bends, params.roundedCorners ?? 5);
        return { ...g, corners, bends };
      }
      return g;
    });
  }

  static path(corners, bends) {
    const rounded = this.calculateRoundedPolygon(corners, bends, 5);
    return WarpedPolygon.path(rounded.corners, rounded.bends);
  }

  static topPath(corners, bends) {
    const rounded = this.calculateRoundedPolygon(corners, bends, 5);
    return WarpedPolygon.topPath(rounded.corners, rounded.bends, 1);
  }

  static render(ctxMix, geoms, params) {
    const processedGeoms = this.processGeoms(geoms, params);
    WarpedPolygon.render(ctxMix, processedGeoms, params, 3);
  }

  static renderSvg(group, geoms, params) {
    const processedGeoms = this.processGeoms(geoms, params);
    WarpedPolygon.renderSvg(group, processedGeoms, params, 1);
  }

  static renderCtx(ctx, geoms, params) {
    const processedGeoms = this.processGeoms(geoms, params);
    WarpedPolygon.renderCtx(ctx, processedGeoms, params, 1);
  }
}

export { RoundedWarpedPolygon };
