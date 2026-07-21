
import * as THREE from 'three';

/**
 * ProjectionMorpher — lerps between perspective and orthographic
 * projection matrices element-by-element.
 */

class ProjectionMorpher {
  constructor(camera, controls, baseFov = 50, near = 0.1, far = 2000) {
    this.camera = camera;
    this.controls = controls;
    this.baseFov = baseFov;
    this.near = near;
    this.far = far;

    this.perspMatrix = new THREE.Matrix4();
    this.orthoMatrix = new THREE.Matrix4();
    this.lerpedMatrix = new THREE.Matrix4();
  }

  lerpMatrices(out, a, b, t) {
    const ae = a.elements;
    const be = b.elements;
    const oe = out.elements;
    for (let i = 0; i < 16; i++) {
      oe[i] = ae[i] + (be[i] - ae[i]) * t;
    }
    return out;
  }

  updateProjection(t, aspect) {
    // Determine target distance. If controls has 'spherical', use that,
    // otherwise if it's OrbitControls, use target distance to camera.
    let dist = 8.0;
    if (this.controls) {
      if (this.controls.spherical && this.controls.spherical.radius) {
        dist = this.controls.spherical.radius;
      } else if (this.controls.target) {
        dist = this.camera.position.distanceTo(this.controls.target);
      } else if (this.controls.getDistance) {
        dist = this.controls.getDistance();
      }
    }

    const fovRad = THREE.MathUtils.degToRad(this.baseFov);

    // Perspective matrix for current distance & aspect
    this.perspMatrix.makePerspective(
      -this.near * Math.tan(fovRad / 2) * aspect,
       this.near * Math.tan(fovRad / 2) * aspect,
       this.near * Math.tan(fovRad / 2),
      -this.near * Math.tan(fovRad / 2),
      this.near, this.far
    );

    // Orthographic matrix
    const halfH = dist * Math.tan(fovRad / 2);
    const halfW = halfH * aspect;
    this.orthoMatrix.makeOrthographic(-halfW, halfW, halfH, -halfH, this.near, this.far);

    // Lerp between the two
    this.lerpMatrices(this.lerpedMatrix, this.perspMatrix, this.orthoMatrix, t);

    this.camera.projectionMatrix.copy(this.lerpedMatrix);
    this.camera.projectionMatrixInverse.copy(this.lerpedMatrix).invert();
  }
}

export {ProjectionMorpher}