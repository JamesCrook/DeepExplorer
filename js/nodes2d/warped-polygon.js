//import { SvgScene } from '../../../q-legacy/js/omni-support/svg-scene.js';
import { Vector2D, lerp } from '../2d-support/vector2d.js';


// ============================================================
// WarpedPolygon - Unified quadrilateral with bend-based arc edges
// ============================================================

class WarpedPolygon {
  static path(corners, bends) {
    let d = `M ${corners[0].x} ${corners[0].y}`;
    let l = corners.length;
    for (let i = 0; i < l; i++) {
      d += this._edge(corners[i], corners[(i + 1) % l], bends[i]);
    }
    return d + ' Z';
  }
  
  static topPath(corners, bends, skip=0) {
    let l = corners.length;
    const p1 = corners[(2+skip)%l], p2 = corners[(3+skip)%l];
    return `M ${p1.x} ${p1.y}` + this._edge(p1, p2, bends[(2+skip)%l]);
  }
  
  static _getArcParams(p1, p2, bend) {
    const chord = p2.sub(p1);
    const chordLength = Math.hypot(chord.x, chord.y);
    const midpoint = p1.mid(p2);
    
    const halfBend = Math.abs(bend) / 2;
    const sinHalf = Math.sin(halfBend);
    if (sinHalf < 0.0001) return null;
    
    const radius = chordLength / (2 * sinHalf);
    const distToCenter = radius * Math.cos(halfBend);
    const perp = chord.perpendicular().normalize();
    const sign = bend > 0 ? 1 : -1;
    const center = midpoint.add(perp.scale(-sign * distToCenter));
    
    const startAngle = Math.atan2(p1.y - center.y, p1.x - center.x);
    const endAngle = Math.atan2(p2.y - center.y, p2.x - center.x);
    const counterclockwise = bend > 0;
    
    return { center, radius, startAngle, endAngle, counterclockwise };
  }
  
  static _edge(p1, p2, bend) {
    const chord = p1.distanceTo(p2);
    if (chord < 0.001) return '';
    
    if (!bend || Math.abs(bend) < 0.01) {
      return ` L ${p2.x} ${p2.y}`;
    }
    
    const arcParams = this._getArcParams(p1, p2, bend);
    if (!arcParams) {
      return ` L ${p2.x} ${p2.y}`;
    }
    
    const { radius, counterclockwise, startAngle, endAngle } = arcParams;
    
    if (radius > chord * 100) {
      return ` L ${p2.x} ${p2.y}`;
    }
    
    let angleDiff = endAngle - startAngle;
    if (counterclockwise) {
      if (angleDiff < 0) angleDiff += Math.PI * 2;
    } else {
      if (angleDiff > 0) angleDiff -= Math.PI * 2;
    }
    const largeArc = Math.abs(angleDiff) > Math.PI ? 0 : 1;
    const sweep = counterclockwise ? 0 : 1;
    
    return ` A ${radius} ${radius} 0 ${largeArc} ${sweep} ${p2.x} ${p2.y}`;
  }

  static render(ctxMix, geoms, params, skip=0) {
    if (ctxMix.ctx) {
      this.renderCtx(ctxMix.ctx, geoms, params, skip );
    } else if (ctxMix.svgGroup) {
      this.renderSvg(ctxMix.svgGroup, geoms, params, skip);
    }
  }

/*
  static renderSvg(group, geoms, params, skip=0) {
    const { fillOpacity, strokeWidth, topWidth, linkWidth } = params;

    for (const g of geoms) {
      if (g.type === 'warpedpoly') {
        const pathD = WarpedPolygon.path(g.corners, g.bends);

        const path = SvgScene.createElement('path');
        path.setAttribute('d', pathD);
        path.setAttribute('fill', g.color);
        path.setAttribute('fill-opacity', g.opacity ?? fillOpacity);
        if (strokeWidth > 0) {
          path.setAttribute('stroke', g.color);
          path.setAttribute('stroke-width', strokeWidth);
        }
        group.appendChild(path);

        if (topWidth > 0) {
          const topD = WarpedPolygon.topPath(g.corners, g.bends, skip);
          const topPath = SvgScene.createElement('path');
          topPath.setAttribute('d', topD);
          topPath.setAttribute('stroke', g.color);
          topPath.setAttribute('stroke-width', topWidth);
          topPath.setAttribute('stroke-linecap', 'round');
          topPath.setAttribute('fill', 'none');
          topPath.setAttribute('opacity', g.opacity ?? 1);
          group.appendChild(topPath);
        }
      } else if (g.type === 'label') {
        const text = SvgScene.createElement('text');
        text.setAttribute('x', g.x);
        text.setAttribute('y', g.y);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('fill', '#888');
        text.setAttribute('font-size', '11px');
        text.setAttribute('dominant-baseline', 'central');        
        if (g.opacity !== undefined) text.setAttribute('opacity', g.opacity);

        let textRot = 0;
        if (g.angle !== undefined) {
          let deg = (g.angle * 180 / Math.PI) % 360;
          if (deg < 0) deg += 360;
          textRot = (deg > 90 && deg < 270) ? deg + 180 : deg;
        } else if (g.rotation !== undefined && g.rotation !== 0) {
          let deg = (g.rotation * 180 / Math.PI) % 360;
          if (deg < 0) deg += 360;
          textRot = (deg >= 67.5 && deg < 112.5) ? -90 : (deg >= 247.5 && deg < 292.5) ? 90 : 0;
        }

        if (textRot !== 0) {
          text.setAttribute('transform', `rotate(${textRot}, ${g.x}, ${g.y})`);
        }

        text.textContent = g.text;
        group.appendChild(text);
      } else if (g.type === 'link') {
        const linkD = WarpedPolygon.path(g.corners, g.bends);
        const topPath = SvgScene.createElement('path');
        topPath.setAttribute('d', linkD);
        topPath.setAttribute('stroke', g.color);
        topPath.setAttribute('stroke-width', linkWidth ?? 1);
        topPath.setAttribute('stroke-linecap', 'round');
        topPath.setAttribute('fill', 'none');
        topPath.setAttribute('opacity', g.opacity ?? 1);
        group.appendChild(topPath);
      }
    }
  };
*/
  static renderCtx(ctx, geoms, params, skip=0) {
    const { fillOpacity, strokeWidth, topWidth, linkWidth } = params;

    for (const g of geoms) {
      if (g.type === 'warpedpoly') {
        const pathD = WarpedPolygon.path(g.corners, g.bends);
        const path2D = new Path2D(pathD);

        ctx.save();
        ctx.globalAlpha = g.opacity ?? fillOpacity;
        ctx.fillStyle = g.color;
        ctx.fill(path2D);
        ctx.restore();

        if (strokeWidth > 0) {
          ctx.save();
          //ctx.globalAlpha = g.opacity ?? fillOpacity;
          ctx.strokeStyle = g.color;
          ctx.lineWidth = strokeWidth;
          ctx.stroke(path2D);
          ctx.restore();
        }
    
        if (topWidth > 0) {
          const topD = WarpedPolygon.topPath(g.corners, g.bends, skip);
          const topPath2D = new Path2D(topD);

          ctx.save();
          //ctx.globalAlpha = g.opacity ?? 1;
          ctx.strokeStyle = g.color;
          ctx.lineWidth = topWidth;
          ctx.lineCap = 'round';
          ctx.stroke(topPath2D);
          ctx.restore();
        }

      } else if (g.type === 'label') {
        let textRot = 0;

        if (g.angle !== undefined) {
          let deg = (g.angle * 180 / Math.PI) % 360;
          if (deg < 0) deg += 360;
          textRot = (deg > 90 && deg < 270) ? deg + 180 : deg;
        } else if (g.rotation !== undefined && g.rotation !== 0) {
          let deg = (g.rotation * 180 / Math.PI) % 360;
          if (deg < 0) deg += 360;
          textRot = (deg >= 67.5 && deg < 112.5) ? -90 : (deg >= 247.5 && deg < 292.5) ? 90 : 0;
        }

        ctx.save();
        if (g.opacity !== undefined) ctx.globalAlpha = g.opacity;
        ctx.fillStyle = '#888';
        let fs = g.fontSize || 11;
        ctx.font = `${fs}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle'; // closest canvas equivalent to SVG's default

        if (textRot !== 0) {
          ctx.translate(g.x, g.y);
          ctx.rotate(textRot * Math.PI / 180);
          ctx.fillText(g.text, 0, 0);
        } else {
          ctx.fillText(g.text, g.x, g.y);
        }

        ctx.restore();
      } else if (g.type === 'text') {
        let v =  g.corners[0].mid(g.corners[1] ).mid(g.corners[2].mid(g.corners[3] ))
        ctx.save();
        ctx.fillStyle = '#777';
        let fs = 11;
        ctx.font = `${fs}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle'; 
        ctx.fillText(g.text, v.x, v.y);
        ctx.restore();
      } else if (g.type === 'link') {
        const linkD = WarpedPolygon.path(g.corners, g.bends);
        const linkPath2D = new Path2D(linkD);

        ctx.save();
        ctx.globalAlpha = g.opacity ?? 1;
        ctx.strokeStyle = g.color;
        ctx.lineWidth = linkWidth ?? 1;
        ctx.lineCap = 'round';
        ctx.stroke(linkPath2D);
        ctx.restore();
      }
    }
  };
}

export { WarpedPolygon }
