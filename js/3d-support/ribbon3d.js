/* ============================================
   ribbon.js — Biarc Ribbon Geometry + UI
   ============================================

   Pure geometry:
     ArcMath             – circular arc computations
     LocalFrameComputer  – Frenet frame estimation
     BiarcSegment3D      – biarc interpolation between two framed points
     RibbonGeometryBuilder – extrude frames into ribbon mesh

   Scene objects:
     Ribbon    – points + rolls + params → mesh (no UI)
     RibbonUI  – has-a Ribbon, adds draggable control spheres,
                 joint spheres, normal arrows, drag protocol

   RibbonUI implements the ThreeApp drag interface:
     getDraggables()           → Mesh[]
     getDragTargetForMesh(m)   → Vector3  (the underlying point to mutate)
     getDragScale(m, params)   → number
     onDragStart(m) / onDragEnd(m)

   Requires: import map for 'three'
*/

import * as THREE from 'three';

// ============================================================
// ARC MATH
// ============================================================

class ArcMath {
  static computeArc(P0, T0, P1) {
    const chord = new THREE.Vector3().subVectors(P1, P0);
    const chordLength = chord.length();
    if (chordLength < 0.0001) return null;

    const chordDir = chord.clone().normalize();
    const dot = T0.dot(chordDir);

    if (Math.abs(dot) > 0.9999999) {
      return this.createLineArc(P0, P1, T0, chordLength);
    }

    const planeNormal = new THREE.Vector3().crossVectors(T0, chordDir).normalize();
    const N0 = new THREE.Vector3().crossVectors(planeNormal, T0).normalize();

    const c_x = chord.dot(T0);
    const c_y = chord.dot(N0);

    if (Math.abs(c_y) < 0.000001) {
      return this.createLineArc(P0, P1, T0, chordLength);
    }

    const r = (c_x * c_x + c_y * c_y) / (2 * c_y);
    const radius = Math.abs(r);
    const center = P0.clone().addScaledVector(N0, r);

    const fromCenter0 = new THREE.Vector3().subVectors(P0, center);
    const fromCenter1 = new THREE.Vector3().subVectors(P1, center);

    let angle = Math.acos(THREE.MathUtils.clamp(
      fromCenter0.dot(fromCenter1) / (radius * radius), -1, 1
    ));
    if (c_x < 0) angle = 2 * Math.PI - angle;

    const sign = Math.sign(r);
    const T1 = new THREE.Vector3().crossVectors(planeNormal, fromCenter1).normalize();
    if (sign < 0) T1.negate();

    return {
      type: 'arc', P0: P0.clone(), P1: P1.clone(), T0: T0.clone(), T1,
      center, radius, angle: angle * sign, planeNormal,
      length: radius * Math.abs(angle)
    };
  }

  static computeArcByEndTangent(P0, P1, T1) {
    const reverseArc = this.computeArc(P1, T1.clone().negate(), P0);
    if (!reverseArc) return null;

    if (reverseArc.type === 'line') {
      return {
        type: 'line', P0: P0.clone(), P1: P1.clone(),
        T0: T1.clone(), T1: T1.clone(), length: reverseArc.length
      };
    }

    return {
      type: 'arc', P0: P0.clone(), P1: P1.clone(),
      T0: reverseArc.T1.clone().negate(), T1: T1.clone(),
      center: reverseArc.center, radius: reverseArc.radius,
      angle: -reverseArc.angle, planeNormal: reverseArc.planeNormal,
      length: reverseArc.length
    };
  }

  static computeJointPoint(P0, P1, T0, T1) {
    const chord = new THREE.Vector3().subVectors(P1, P0);
    const L = chord.length();
    if (L < 0.0001) return P0.clone().lerp(P1, 0.5);

    const d = chord.clone().normalize();
    const midpoint = new THREE.Vector3().addVectors(P0, P1).multiplyScalar(0.5);

    let e1 = new THREE.Vector3().addVectors(T0, T1);
    e1.addScaledVector(d, -e1.dot(d));
    if (e1.length() < 0.001) {
      e1.set(1, 0, 0);
      if (Math.abs(d.dot(e1)) > 0.9) e1.set(0, 1, 0);
      e1.addScaledVector(d, -e1.dot(d));
    }
    e1.normalize();
    const e2 = new THREE.Vector3().crossVectors(d, e1);

    const t0_d = T0.dot(d), t0_e1 = T0.dot(e1);
    const t1_d = T1.dot(d), t1_e1 = T1.dot(e1);
    const angle0 = Math.atan2(t0_e1, t0_d);
    const angle1 = Math.atan2(t1_e1, t1_d);
    let thetaDiff = angle0 - angle1;
    while (thetaDiff > Math.PI) thetaDiff -= 2 * Math.PI;
    while (thetaDiff < -Math.PI) thetaDiff += 2 * Math.PI;

    let s = Math.tan(thetaDiff * 0.25) * 0.5 * L;
    let t = 0;

    const computeTangentError = (s, t) => {
      const J = midpoint.clone().addScaledVector(e1, s).addScaledVector(e2, t);
      const u_hat = new THREE.Vector3().subVectors(J, P0).normalize();
      const v_hat = new THREE.Vector3().subVectors(P1, J).normalize();
      const T_J1 = u_hat.clone().multiplyScalar(2 * T0.dot(u_hat)).sub(T0);
      const T_J2 = v_hat.clone().multiplyScalar(2 * T1.dot(v_hat)).sub(T1);
      return new THREE.Vector3().subVectors(T_J1, T_J2);
    };

    const eps = 0.0001;
    for (let iter = 0; iter < 3; iter++) {
      const err = computeTangentError(s, t);
      if (err.length() < 1e-10) break;
      const err_ds = computeTangentError(s + eps, t);
      const err_dt = computeTangentError(s, t + eps);
      const J11 = (err_ds.dot(e1) - err.dot(e1)) / eps;
      const J12 = (err_dt.dot(e1) - err.dot(e1)) / eps;
      const J21 = (err_ds.dot(e2) - err.dot(e2)) / eps;
      const J22 = (err_dt.dot(e2) - err.dot(e2)) / eps;
      const det = J11 * J22 - J12 * J21;
      if (Math.abs(det) < 1e-12) break;
      s += -(J22 * err.dot(e1) - J12 * err.dot(e2)) / det;
      t += -(-J21 * err.dot(e1) + J11 * err.dot(e2)) / det;
    }

    return midpoint.clone().addScaledVector(e1, s).addScaledVector(e2, t);
  }

  static createLineArc(P0, P1, T0, length) {
    return { type: 'line', P0: P0.clone(), P1: P1.clone(), T0: T0.clone(), T1: T0.clone(), length };
  }

  static sampleArc(arc, t) {
    if (t <= 0) return arc.P0.clone();
    if (t >= 1) return arc.P1.clone();
    if (arc.type === 'line') return new THREE.Vector3().lerpVectors(arc.P0, arc.P1, t);
    const theta = arc.angle * t;
    const fromCenter0 = new THREE.Vector3().subVectors(arc.P0, arc.center);
    return arc.center.clone().add(fromCenter0.clone().applyAxisAngle(arc.planeNormal, theta));
  }

  static sampleArcTangent(arc, t) {
    if (arc.type === 'line') return arc.T0.clone();
    return arc.T0.clone().applyAxisAngle(arc.planeNormal, arc.angle * t);
  }

  static transportBinormal(arc, B0) {
    if (arc.type === 'line') return B0.clone();
    return B0.clone().applyAxisAngle(arc.planeNormal, arc.angle);
  }
}

// ============================================================
// LOCAL FRAME COMPUTER
// ============================================================

class LocalFrameComputer {
  static computeTangent(points, i) {
    const n = points.length;
    let T;
    if (i === 0)          T = new THREE.Vector3().subVectors(points[1], points[0]);
    else if (i === n - 1) T = new THREE.Vector3().subVectors(points[n - 1], points[n - 2]);
    else                  T = new THREE.Vector3().subVectors(points[i + 1], points[i - 1]);
    return T.normalize();
  }

  static computeBinormal(points, i, tangent) {
    const n = points.length;
    let B;

    if (i === 0) {
      B = n >= 3
        ? new THREE.Vector3().crossVectors(
            new THREE.Vector3().subVectors(points[1], points[0]),
            new THREE.Vector3().subVectors(points[2], points[0]))
        : this.getDefaultBinormal(tangent);
    } else if (i === n - 1) {
      B = n >= 3
        ? new THREE.Vector3().crossVectors(
            new THREE.Vector3().subVectors(points[n - 2], points[n - 3]),
            new THREE.Vector3().subVectors(points[n - 1], points[n - 3]))
        : this.getDefaultBinormal(tangent);
    } else {
      B = new THREE.Vector3().crossVectors(
        new THREE.Vector3().subVectors(points[i], points[i - 1]),
        new THREE.Vector3().subVectors(points[i + 1], points[i - 1]));
    }

    if (B.length() < 0.0001) B = this.getDefaultBinormal(tangent);
    B.normalize();
    B.addScaledVector(tangent, -B.dot(tangent)).normalize();
    return B;
  }

  static getDefaultBinormal(tangent) {
    const T = tangent.clone().normalize();
    let refUp = new THREE.Vector3(0, 1, 0);
    if (Math.abs(T.y) > 0.95) refUp = new THREE.Vector3(0, 0, 1);
    let B = new THREE.Vector3().crossVectors(T, refUp);
    if (B.length() < 0.001) B = new THREE.Vector3().crossVectors(T, new THREE.Vector3(1, 0, 0));
    return B.normalize();
  }

  static computeFrame(points, i) {
    const T = this.computeTangent(points, i);
    const B = this.computeBinormal(points, i, T);
    const N = new THREE.Vector3().crossVectors(B, T).normalize();
    return { T, B, N };
  }

  static computeAllFrames(points) {
    const frames = [];
    for (let i = 0; i < points.length; i++) {
      frames.push(this.computeFrame(points, i));
    }
    // Consistency pass
    for (let i = 1; i < frames.length; i++) {
      if (frames[i].B.dot(frames[i - 1].B) < 0) {
        frames[i].B.negate();
        frames[i].N.negate();
      }
    }
    return frames;
  }
}

// ============================================================
// BIARC SEGMENT 3D
// ============================================================

class BiarcSegment3D {
  constructor(P0, P1, frame0, frame1) {
    this.P0 = P0.clone();
    this.P1 = P1.clone();
    this.T0 = frame0.T.clone();
    this.T1 = frame1.T.clone();
    this.B0 = frame0.B.clone();
    this.B1 = frame1.B.clone();

    this.computeJointAndArcs();
    this.computeTorsion();
  }

  computeJointAndArcs() {
    const chord = new THREE.Vector3().subVectors(this.P1, this.P0);
    if (chord.length() < 0.0001) {
      this.J = this.P0.clone();
      this.T_J = this.T0.clone();
      this.arc1 = ArcMath.createLineArc(this.P0, this.J, this.T0, 0);
      this.arc2 = ArcMath.createLineArc(this.J, this.P1, this.T_J, 0);
      this.length = 0;
      return;
    }

    this.J = ArcMath.computeJointPoint(this.P0, this.P1, this.T0, this.T1);
    this.arc1 = ArcMath.computeArc(this.P0, this.T0, this.J);
    this.arc2 = ArcMath.computeArcByEndTangent(this.J, this.P1, this.T1);
    this.T_J = this.arc1 ? this.arc1.T1.clone() : this.T0.clone();
    this.length = (this.arc1 ? this.arc1.length : 0) + (this.arc2 ? this.arc2.length : 0);
  }

  computeTorsion() {
    if (!this.arc1 || !this.arc2) { this.totalTorsion = 0; return; }
    let B = ArcMath.transportBinormal(this.arc1, this.B0.clone());
    B = ArcMath.transportBinormal(this.arc2, B);
    this.totalTorsion = this._twistAngle(B, this.B1, this.T1);
  }

  _twistAngle(B1, B2, T) {
    const p1 = B1.clone().addScaledVector(T, -B1.dot(T)).normalize();
    const p2 = B2.clone().addScaledVector(T, -B2.dot(T)).normalize();
    let angle = Math.acos(THREE.MathUtils.clamp(p1.dot(p2), -1, 1));
    if (new THREE.Vector3().crossVectors(p1, p2).dot(T) < 0) angle = -angle;
    return angle;
  }

  getPointAt(t) {
    if (!this.arc1 || !this.arc2 || this.length === 0)
      return new THREE.Vector3().lerpVectors(this.P0, this.P1, t);
    const r = this.arc1.length / this.length;
    return t <= r
      ? ArcMath.sampleArc(this.arc1, r > 0 ? t / r : 0)
      : ArcMath.sampleArc(this.arc2, (1 - r) > 0 ? (t - r) / (1 - r) : 1);
  }

  getTangentAt(t) {
    if (!this.arc1 || !this.arc2 || this.length === 0) return this.T0.clone();
    const r = this.arc1.length / this.length;
    return t <= r
      ? ArcMath.sampleArcTangent(this.arc1, r > 0 ? t / r : 0)
      : ArcMath.sampleArcTangent(this.arc2, (1 - r) > 0 ? (t - r) / (1 - r) : 1);
  }

  getFrameAt(t) {
    const P = this.getPointAt(t);
    const T = this.getTangentAt(t).normalize();

    if (!this.arc1 || !this.arc2 || this.length === 0) {
      const B = this.B0.clone().addScaledVector(T, -this.B0.dot(T)).normalize();
      return { P, T, N: new THREE.Vector3().crossVectors(B, T).normalize(), B };
    }

    let B = this.B0.clone();
    const r = this.arc1.length / this.length;

    if (t <= r) {
      if (this.arc1.type === 'arc') B.applyAxisAngle(this.arc1.planeNormal, this.arc1.angle * (r > 0 ? t / r : 0));
    } else {
      B = ArcMath.transportBinormal(this.arc1, B);
      if (this.arc2.type === 'arc') B.applyAxisAngle(this.arc2.planeNormal, this.arc2.angle * ((1 - r) > 0 ? (t - r) / (1 - r) : 1));
    }

    B.applyAxisAngle(T, this.totalTorsion * t);
    B.addScaledVector(T, -B.dot(T)).normalize();
    return { P, T, N: new THREE.Vector3().crossVectors(B, T).normalize(), B };
  }

  getLength()     { return this.length; }
  getJointPoint() { return this.J ? this.J.clone() : null; }
}

// ============================================================
// RIBBON GEOMETRY BUILDER
// ============================================================

class RibbonGeometryBuilder {
  static build(segments, width, thickness, samplesPerSegment, arrowHeads, arrowHeads2, colors, axisInfo = null) {
    const samples = this.sampleAllSegments(segments, samplesPerSegment);

    // Expand per-control-point colors to per-sample colors by interpolating
    // along each segment. `colors` has one entry per control point (segments.length + 1),
    // but `samples` has 1 + segments.length * samplesPerSegment entries.
    let sampleColors = null;
    if (colors && colors.length > 0) {
      sampleColors = [];
      for (let si = 0; si < segments.length; si++) {
        const startI = si === 0 ? 0 : 1;
        const c0 = colors[Math.min(si, colors.length - 1)];
        const c1 = colors[Math.min(si + 1, colors.length - 1)];
        const blend = axisInfo && axisInfo.colorSmoothing !== undefined ? axisInfo.colorSmoothing : 0;
        for (let i = startI; i <= samplesPerSegment; i++) {
          const t = i / samplesPerSegment;
          let t_prime = t;

          if (blend === 0) {
            t_prime = t < 0.5 ? 0 : 1;
          } else if (blend < 1) {
            const halfBlend = blend / 2;
            const startBlend = 0.5 - halfBlend;
            const endBlend = 0.5 + halfBlend;

            if (t <= startBlend) {
              t_prime = 0;
            } else if (t >= endBlend) {
              t_prime = 1;
            } else {
              t_prime = (t - startBlend) / blend;
            }
          }

          sampleColors.push(c0.clone().lerp(c1, t_prime));
        }
      }
    }

    return this.buildGeometryFromSamples(samples, width / 2, thickness / 2, arrowHeads, arrowHeads2, sampleColors, axisInfo);
  }

  static sampleAllSegments(segments, samplesPerSegment) {
    const samples = [];
    let cumLen = 0;
    const totalLen = segments.reduce((s, seg) => s + seg.getLength(), 0);

    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si];
      const segLen = seg.getLength();
      const startI = si === 0 ? 0 : 1;

      for (let i = startI; i <= samplesPerSegment; i++) {
        const t = i / samplesPerSegment;
        const frame = seg.getFrameAt(t);
        samples.push({ ...frame, u: totalLen > 0 ? (cumLen + segLen * t) / totalLen : 0 });
      }
      cumLen += segLen;
    }
    return samples;
  }

  static buildGeometryFromSamples(samples, halfW, halfT, arrowHeads, arrowHeads2, colors, axisInfo = null) {
    const positions = [], normals = [], uvs = [], indices = [];
    const vertexColors = colors ? [] : null;

    // Binary width multiplier: 1 if dot >= threshold, 0 otherwise
    const usesFade = axisInfo && axisInfo.referenceAxis && axisInfo.ribbonFade > 0;
    const computeWidthScale = (s) => {
      if (!usesFade) return 1.0;
      const dot = Math.abs(s.T.dot(axisInfo.referenceAxis));
      return dot >= axisInfo.ribbonFade ? 1.0 : 0.0;
    };

    const addQuad = (v0, v1, v2, v3, normal, u0, u1, col0, col1, col2, col3) => {
      const base = positions.length / 3;
      for (const v of [v0, v1, v2, v3]) positions.push(v.x, v.y, v.z);
      for (let j = 0; j < 4; j++) normals.push(normal.x, normal.y, normal.z);
      uvs.push(0, u0, 1, u0, 1, u1, 0, u1);

      if (colors && col0 && col1 && col2 && col3) {
        vertexColors.push(col0.r, col0.g, col0.b);
        vertexColors.push(col1.r, col1.g, col1.b);
        vertexColors.push(col2.r, col2.g, col2.b);
        vertexColors.push(col3.r, col3.g, col3.b);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };

    const getCorners = (s, hw, ht) => [
      new THREE.Vector3().copy(s.P).addScaledVector(s.N, ht).addScaledVector(s.B, -hw),
      new THREE.Vector3().copy(s.P).addScaledVector(s.N, ht).addScaledVector(s.B, hw),
      new THREE.Vector3().copy(s.P).addScaledVector(s.N, -ht).addScaledVector(s.B, hw),
      new THREE.Vector3().copy(s.P).addScaledVector(s.N, -ht).addScaledVector(s.B, -hw)
    ];

    const addEndCap = (s, hw, ht, flip, color) => {
      const base = positions.length / 3;
      const normal = flip ? s.T.clone().negate() : s.T.clone();
      const corners = getCorners(s, hw, ht);
      for (const c of corners) positions.push(c.x, c.y, c.z);
      for (let j = 0; j < 4; j++) normals.push(normal.x, normal.y, normal.z);
      uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
      if (colors) {
        const c = color || { r: 1, g: 1, b: 1 };
        for (let j = 0; j < 4; j++) vertexColors.push(c.r, c.g, c.b);
      }
      if (flip) { indices.push(base, base + 2, base + 1, base, base + 3, base + 2); }
      else      { indices.push(base, base + 1, base + 2, base, base + 3, base + 2); }
    };

    const arrowHeadFn = ( j, b = 0, m=3 ) => {
      const depth = 10;
      const spacing = 40;
      let i = Math.max(0,(spacing-1)-(j+(spacing-1))%spacing);
      if( i > depth)
        return 1;//i/spacing
      return Math.max(0,(1-m*b))+m*b*(i/depth)
    };

    const reseqFn = ( j ) => {
      const depth = 10;
      const spacing = 40;
      let i = Math.max(0,(spacing-1)-(j+(spacing-1))%spacing);
      if( i%40 ==39)
        return j-1;
      if( i>=11)
        return j+1
      return j;
    };

    for (let i = 0; i < samples.length - 1; i++) {
      const s0 = samples[reseqFn( i )], s1 = samples[reseqFn( i+1 )];
      const k = 1/(halfW+(0.1));
      const m1 = arrowHeadFn( i, arrowHeads, k );
      const m2 = arrowHeadFn( (i+1), arrowHeads, k );
      const k2 = 1/(halfT+(0.1));
      const n1 = arrowHeadFn( i, arrowHeads2, k2 );
      const n2 = arrowHeadFn( (i+1), arrowHeads2, k2 );

      // Width collapse: multiply halfW and halfT by 0 or 1 per sample
      const w0 = computeWidthScale(s0);
      const w1 = computeWidthScale(s1);
      const hw0 = halfW * m1 * w0, ht0 = halfT * n1 * w0;
      const hw1 = halfW * m2 * w1, ht1 = halfT * n2 * w1;

      const c0 = getCorners(s0, hw0, ht0);
      const c1 = getCorners(s1, hw1, ht1);

      const col0 = colors ? colors[i] : null;
      const col1 = colors ? colors[i + 1] : null;

      addQuad(c0[0], c0[1], c1[1], c1[0], s0.N.clone().lerp(s1.N, 0.5).normalize(), s0.u, s1.u, col0, col0, col1, col1);
      addQuad(c0[3], c1[3], c1[2], c0[2], s0.N.clone().lerp(s1.N, 0.5).normalize().negate(), s0.u, s1.u, col0, col1, col1, col0);
      const rightN = s0.B.clone().lerp(s1.B, 0.5).normalize();
      addQuad(c0[1], c0[2], c1[2], c1[1], rightN, s0.u, s1.u, col0, col0, col1, col1);
      addQuad(c0[0], c1[0], c1[3], c0[3], rightN.clone().negate(), s0.u, s1.u, col0, col1, col1, col0);
    }

    // End caps: use width scale for first/last sample
    const ws0 = computeWidthScale(samples[0]);
    const wsN = computeWidthScale(samples[samples.length - 1]);
    addEndCap(samples[0], halfW * ws0, halfT * ws0, true, colors ? colors[0] : null);
    addEndCap(samples[samples.length - 1], halfW * wsN, halfT * wsN, false, colors ? colors[samples.length - 1] : null);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    if (colors) {
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(vertexColors, 3));
    }
    geometry.setIndex(indices);
    return geometry;
  }
}

// ============================================================
// SMOOTHING UTILITY
// ============================================================

function smoothPoints(points, weight) {
  const smoothed = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    if (i === 0 || i === n - 1) { smoothed.push(points[i].clone()); continue; }
    const P = points[i], A = points[i - 1], B = points[i + 1];
    const AB = new THREE.Vector3().subVectors(B, A);
    const AP = new THREE.Vector3().subVectors(P, A);
    const abLenSq = AB.lengthSq();
    const nearest = abLenSq < 0.0001
      ? A.clone()
      : A.clone().addScaledVector(AB, Math.max(0, Math.min(1, AP.dot(AB) / abLenSq)));
    smoothed.push(P.clone().lerp(nearest, weight));
  }
  return smoothed;
}

// ============================================================
// RIBBON (mesh only, no UI)
// ============================================================

class Ribbon {
  /**
   * @param {Object} sceneManager - must have add(obj) / remove(obj)
   * @param {Object} [options]
   * @param {number} [options.color=0x4fc3f7]
   * @param {number} [options.samplesPerSegment=40]
   */
  constructor(sceneManager, options = {}) {
    this.sceneManager = sceneManager;
    this.color = options.color ?? 0x4fc3f7;
    this.samplesPerSegment = options.samplesPerSegment ?? 40;

    this.points = [];
    this.rolls = [];
    this.meshes = [];

    this.material = new THREE.MeshStandardMaterial({
      color: this.color, metalness: 0.1, roughness: 0.65, side: THREE.FrontSide
    });
  }

  setData(points, rolls) {
    this.points = points;
    this.rolls = rolls;
  }

  /**
   * Rebuild the ribbon mesh from current points.
   * @param {Object} params - must include width, thickness, smoothing
   * @param {Array} [colors] - optional per-control-point THREE.Color array
   * @returns {{ jointPositions, frames, segmentCount, pointCount }|null}
   *
   * Additional state read from properties:
   *   this.arrowHeads — arrow head depth (0 = none), set externally
   *   this.axisInfo   — { referenceAxis, ribbonFade, colorSmoothing }, set externally
   */
  rebuild(params, colors) {
    this.clearMeshes();
    
    // Skip all computation when ribbon is invisible
    if ((params.width ?? 0) <= 0.001 || (params.thickness ?? 0) <= 0.001) {
      return { jointPositions: [], frames: [], segmentCount: 0, pointCount: 0 };
    }

    if (colors && colors.length > 0) {
      this.material.vertexColors = true;
      this.material.color.setHex(0xffffff);
    } else {
      this.material.vertexColors = false;
      this.material.color.setHex(this.color);
    }
    this.material.needsUpdate = true;

    let workingPoints = this.points.map(p => p.clone());
    if (params.smoothing > 0) {
      workingPoints = smoothPoints(this.points, params.smoothing);
    }

    if (workingPoints.length < 2) return null;

    const frames = LocalFrameComputer.computeAllFrames(workingPoints);

    // Apply per-point roll
    for (let i = 0; i < frames.length; i++) {
      const roll = this.rolls[i] || 0;
      if (roll !== 0) {
        const rollRad = THREE.MathUtils.degToRad(roll);
        frames[i].B.applyAxisAngle(frames[i].T, rollRad);
        frames[i].N = new THREE.Vector3().crossVectors(frames[i].B, frames[i].T).normalize();
      }
    }

    const segments = [];
    const jointPositions = [];

    for (let i = 0; i < workingPoints.length - 1; i++) {
      const seg = new BiarcSegment3D(workingPoints[i], workingPoints[i + 1], frames[i], frames[i + 1]);
      segments.push(seg);
      const joint = seg.getJointPoint();
      if (joint) jointPositions.push(joint);
    }

    if (segments.length === 0) return null;

    if (params.width > 0.001 && params.thickness > 0.001) {
      const geom = RibbonGeometryBuilder.build(segments, params.width, params.thickness, this.samplesPerSegment, this.arrowHeads,  params.arrowHeads2, colors, this.axisInfo);
      const mesh = new THREE.Mesh(geom, this.material);
      this.sceneManager.add(mesh);
      this.meshes.push(mesh);
    }

    return {
      jointPositions,
      frames,
      segmentCount: segments.length,
      pointCount: workingPoints.length,
      segments
    };
  }

  clearMeshes() {
    for (const m of this.meshes) { m.geometry.dispose(); this.sceneManager.remove(m); }
    this.meshes = [];
  }

  clear() {
    this.clearMeshes();
  }
}

// ============================================================
// RIBBON UI (interactive editing layer)
// ============================================================

class RibbonUI {
  /**
   * @param {Object} sceneManager - must have add/remove
   * @param {Object} [options]
   * @param {string} [options.key='ribbon']           - drag owner key
   * @param {number} [options.color=0x4fc3f7]
   * @param {number} [options.samplesPerSegment=40]
   */
  constructor(sceneManager, options = {}) {
    this.sceneManager = sceneManager;
    this.objectKey = options.key ?? 'ribbon';

    this.ribbon = new Ribbon(sceneManager, options);
    this.points = [];
    this.rolls = [];

    this.controlAtoms = [];
    this.intermediateAtoms = [];
    this.nitroAtoms = [];
    this.normalIndicators = [];
    this.controlAtomsBuilt = false;

    this.baseNodeRadius = { control: 0.25, joint: 0.2, nitro: 0.2 };
    this._setupMaterials();
  }

  _setupMaterials() {
    this.materials = {
      controlNode: new THREE.MeshStandardMaterial({
        color: 0x909090, metalness: 0.3, roughness: 0.4, emissive: 0x331111
      }),
      controlNodeHover: new THREE.MeshStandardMaterial({
        color: 0xf0f0f0, metalness: 0.3, roughness: 0.4, emissive: 0x442200
      }),
      intermediateNode: new THREE.MeshStandardMaterial({
        color: 0x6bff6b, metalness: 0.3, roughness: 0.4, emissive: 0x113311
      }),
      nitroNode: new THREE.MeshStandardMaterial({
        color: 0x7b7bff, metalness: 0.3, roughness: 0.4, emissive: 0x111133
      })
    };
  }

  setData(points, rolls) {
    this.points = points;
    this.rolls = rolls;
    this.ribbon.setData(points, rolls);
    this.controlAtomsBuilt = false;
  }

  // ── Object interface (ThreeApp compatible) ─────────────────

  rebuild(params) {
    this._clearControlAtoms();
    this.controlAtomsBuilt = false;
    this.partialRebuild(params, []);
  }

  partialRebuild(params, changed) {
    if (this.points.length < 2) return;

    // Display positions for control atoms (separate smoothing)
    let displayPositions = this.points;
    if (params.controlNodeSmoothing > 0) {
      displayPositions = smoothPoints(this.points, params.controlNodeSmoothing);
    }

    // Control atoms: create once, reposition thereafter
    if (!this.controlAtomsBuilt) {
      this._clearControlAtoms();
      this._createControlAtoms(displayPositions, params);
      this.controlAtomsBuilt = true;
    } else {
      this._repositionControlAtoms(displayPositions);
    }

    // Ribbon mesh + diagnostics: always rebuild
    this._clearDiagnostics();

    const result = this.ribbon.rebuild(params, this.colors);
    if (result) {
      this._buildIntermediateAtoms(result.jointPositions, params);
      this._buildNitroAtoms(result.segments, params);
      this._buildNormalIndicators(result.frames, this.points, params);
    }
  }

  update(params) { /* no cheap ribbon-only updates currently */ }

  clear() {
    this._clearControlAtoms();
    this._clearDiagnostics();
    this.ribbon.clear();
    this.controlAtomsBuilt = false;
  }

  // ── Drag interface ─────────────────────────────────────────

  getDraggables() {
    return this.controlAtoms.filter(a => a.visible);
  }

  getDragTargetForMesh(mesh) {
    const idx = mesh.userData.pointIndex;
    return (idx !== undefined && idx >= 0 && idx < this.points.length) ? this.points[idx] : null;
  }

  getDragScale(mesh, params) {
    const w = params.controlNodeSmoothing ?? 0;
    return w < 0.95 ? 1 / (1 - w) : 20;
  }

  onDragStart(mesh) { mesh.material = this.materials.controlNodeHover.clone(); }
  onDragEnd(mesh)   { mesh.material = this.materials.controlNode.clone(); }

  // ── Internal: control atoms ────────────────────────────────

  _effectiveRadius(type, params) {
    const base = this.baseNodeRadius[type];
    const global = Math.max(0.01, params.nodeScale ?? 0.5);
    const sizes = { control: params.controlNodeSize, joint: params.jointNodeSize, nitro: params.nitroNodeSize };
    const typeScale = sizes[type] ?? 0.5;
    return base * global * typeScale * 2;
  }

  _buildNitroAtoms(segments, params) {
    if (!segments) return;
    const radius = this._effectiveRadius('nitro', params);
    if (radius <= 0.001) return;
    const geom = new THREE.SphereGeometry(radius, 32, 32);

    for (const seg of segments) {
      const pos = seg.getPointAt(params.nitroPos ?? 0.66);
      if (pos) {
        const sphere = new THREE.Mesh(geom, this.materials.nitroNode);
        sphere.position.copy(pos);
        sphere.userData.isNitro = true;
        this.sceneManager.add(sphere);
        this.nitroAtoms.push(sphere);
      }
    }
  }

  _createControlAtoms(displayPositions, params) {
    const radius = this._effectiveRadius('control', params);
    const visible = radius > 0.001;
    const geom = visible ? new THREE.SphereGeometry(radius, 32, 32) : new THREE.SphereGeometry(0.001, 4, 4);

    displayPositions.forEach((point, index) => {
      const sphere = new THREE.Mesh(geom, this.materials.controlNode.clone());
      sphere.position.copy(point);
      sphere.userData.pointIndex = index;
      sphere.userData.dragOwner = this.objectKey;
      sphere.userData.dragOwnerInst = this.dragOwnerInst;
      sphere.userData.isControl = true;
      sphere.visible = visible;
      this.sceneManager.add(sphere);
      this.controlAtoms.push(sphere);
    });
  }

  _repositionControlAtoms(displayPositions) {
    for (let i = 0; i < this.controlAtoms.length && i < displayPositions.length; i++) {
      this.controlAtoms[i].position.copy(displayPositions[i]);
    }
  }

  _buildIntermediateAtoms(jointPositions, params) {
    const radius = this._effectiveRadius('joint', params);
    if (radius <= 0.001) return;
    const geom = new THREE.SphereGeometry(radius, 32, 32);

    for (const pos of jointPositions) {
      const sphere = new THREE.Mesh(geom, this.materials.intermediateNode.clone());
      sphere.position.copy(pos);
      sphere.userData.isIntermediate = true;
      this.sceneManager.add(sphere);
      this.intermediateAtoms.push(sphere);
    }
  }

  _buildNormalIndicators(frames, positions, params) {
    const size = (params.normalIndicatorSize ?? 0) * (params.nodeScale ?? 0.5);
    if (size < 0.01) return;
    const len = 0.8 * size * 2, headLen = 0.15 * size * 2, headW = 0.1 * size * 2;

    for (let i = 0; i < frames.length; i++) {
      const pos = positions[i];
      const { B, N } = frames[i];
      const nArrow = new THREE.ArrowHelper(N, pos, len, 0xc9a66b, headLen, headW);
      this.sceneManager.add(nArrow);
      this.normalIndicators.push(nArrow);
      const bArrow = new THREE.ArrowHelper(B, pos, len, 0x7eb5a6, headLen, headW);
      this.sceneManager.add(bArrow);
      this.normalIndicators.push(bArrow);
    }
  }

  _clearControlAtoms() {
    for (const a of this.controlAtoms) { a.geometry.dispose(); this.sceneManager.remove(a); }
    this.controlAtoms = [];
  }

  _clearDiagnostics() {
    for (const m of this.ribbon.meshes) { /* cleared by ribbon.rebuild */ }
    for (const a of this.intermediateAtoms) { a.geometry.dispose(); this.sceneManager.remove(a); }
    this.intermediateAtoms = [];
    for (const a of this.nitroAtoms) { a.geometry.dispose(); this.sceneManager.remove(a); }
    this.nitroAtoms = [];
    for (const a of this.normalIndicators) this.sceneManager.remove(a);
    this.normalIndicators = [];
  }
}

// ── Exports ──────────────────────────────────────────────────
export {
  ArcMath, LocalFrameComputer, BiarcSegment3D, RibbonGeometryBuilder,
  Ribbon, RibbonUI, smoothPoints
};