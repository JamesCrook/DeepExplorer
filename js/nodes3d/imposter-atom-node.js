import { SceneNode, sceneRegistry } from '../omni-support/scene.js';
import * as THREE from 'three';
import { CPK_ATOM_DATA } from '../parsers/pdb-parser.js';

/**
 * ImposterAtomNode — high-performance atom rendering using billboard impostors.
 *
 * Each atom is a single screen-facing quad (2 triangles). The fragment shader
 * ray-traces a sphere and writes correct gl_FragDepth, producing pixel-perfect
 * spheres at ~0.4% of the triangle count of SphereGeometry(10,10).
 *
 * AST wiring:
 *   new MiniAstNode('imposter-atoms', [], {})
 *
 * Data (set on inst before or after build):
 *   inst.setData(atoms, scale, chainColorMap)
 *
 * After build:
 *   node.inst.group — THREE.Group (for parent to add to scene)
 *
 * Update params:
 *   atomRadius, atomOpacity, atomRangeStart, atomRangeEnd,
 *   sidechainFade, referenceAxis (injected),
 *   mainLight, fillLight, backLight
 *
 * Phases handled: build, update, teardown
 *
 * Performance vs InstancedMesh with SphereGeometry(10,10):
 *   Hemoglobin (~4,500 atoms):
 *     SphereGeometry: 4,500 × 200 tris = 900K triangles
 *     Imposters:      4,500 × 2 tris   = 9K triangles
 *   Vertex throughput drops ~100×. Fragment cost is higher per pixel
 *   (ray-sphere intersection) but total is far less on typical views
 *   where atoms are small on screen.
 */

// ── Shaders ──────────────────────────────────────────────

const VERTEX_SHADER = /* glsl */ `
  in vec3 instancePosition;
  in float instanceRadius;
  in vec3 instanceColor;

  out vec3 vViewCenter;
  out float vRadius;
  out vec3 vColor;
  out vec3 vFragViewPos;

  void main() {
    vColor = instanceColor;
    vRadius = instanceRadius;

    // Sphere center in view space
    vec4 viewCenter = modelViewMatrix * vec4(instancePosition, 1.0);
    vViewCenter = viewCenter.xyz;

    // Billboard: offset quad corners in view space (screen-aligned).
    // Pad to 1.3× radius so edge fragments aren't clipped.
    vec3 viewPos = viewCenter.xyz + vec3(position.xy * instanceRadius * 1.3, 0.0);
    vFragViewPos = viewPos;

    gl_Position = projectionMatrix * vec4(viewPos, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform mat4 projectionMatrix;

  uniform float uOpacity;
  uniform float uLightness;
  uniform vec3 uAmbientColor;
  uniform vec3 uLightDir0;
  uniform vec3 uLightColor0;
  uniform float uLightIntensity0;
  uniform vec3 uLightDir1;
  uniform vec3 uLightColor1;
  uniform float uLightIntensity1;
  uniform vec3 uLightDir2;
  uniform vec3 uLightColor2;
  uniform float uLightIntensity2;

  in vec3 vViewCenter;
  in float vRadius;
  in vec3 vColor;
  in vec3 vFragViewPos;

  out vec4 fragColor;

  void main() {
    // Zero-radius instances produce zero-area quads so no fragments
    // reach here, but guard just in case.
    if (vRadius <= 0.0) discard;

    // Ray from camera (origin in view space) through this fragment
    vec3 rayDir = normalize(vFragViewPos);

    // Ray–sphere intersection (camera is at origin in view space)
    vec3 oc = -vViewCenter;
    float b = dot(oc, rayDir);
    float c = dot(oc, oc) - vRadius * vRadius;
    float disc = b * b - c;

    if (disc < 0.0) discard;

    float t = -b - sqrt(disc);
    if (t < 0.0) discard;   // sphere behind camera

    vec3 hitPoint = rayDir * t;
    vec3 normal = normalize(hitPoint - vViewCenter);

    // Correct depth
    vec4 clipPos = projectionMatrix * vec4(hitPoint, 1.0);
    gl_FragDepth = (clipPos.z / clipPos.w) * 0.5 + 0.5;

    // Transform light dirs from world to view space
    vec3 ld0 = normalize((viewMatrix * vec4(uLightDir0, 0.0)).xyz);
    vec3 ld1 = normalize((viewMatrix * vec4(uLightDir1, 0.0)).xyz);
    vec3 ld2 = normalize((viewMatrix * vec4(uLightDir2, 0.0)).xyz);

    // Blinn-Phong (soft, not shiny — shininess 30, low specular)
    vec3 viewDir = normalize(-hitPoint);
    float shininess = 30.0;
    float specStrength = 0.15;

    vec3 effectiveColor = vColor;
    if (uLightness < 0.5) {
      effectiveColor = mix(effectiveColor, vec3(0.0), 1.0 - uLightness * 2.0);
    } else {
      effectiveColor = mix(effectiveColor, vec3(1.0), uLightness * 2.0 - 1.0);
    }

    vec3 color = uAmbientColor * effectiveColor;

    // Accumulate directional lights
    for (int i = 0; i < 3; i++) {
      vec3 ld    = (i == 0) ? ld0    : (i == 1) ? ld1    : ld2;
      vec3 lc    = (i == 0) ? uLightColor0 : (i == 1) ? uLightColor1 : uLightColor2;
      float li   = (i == 0) ? uLightIntensity0 : (i == 1) ? uLightIntensity1 : uLightIntensity2;

      float diff = max(dot(normal, ld), 0.0);
      vec3 half_ = normalize(ld + viewDir);
      float spec = pow(max(dot(normal, half_), 0.0), shininess);
      color += (diff * effectiveColor + spec * specStrength) * lc * li;
    }

    fragColor = vec4(color, uOpacity);
  }
`;

// ── Default light configuration (matches Molam scene) ────

// Light directions: toward the light source (for dot product with normal).
// THREE DirectionalLight at position P shining toward origin:
// direction toward light = normalize(P).
const DEFAULT_LIGHTS = [
  { dir: new THREE.Vector3( 5, 15,  10).normalize(), color: new THREE.Color(0xffffff), intensity: 1.2 },
  { dir: new THREE.Vector3(-10,  5,  -5).normalize(), color: new THREE.Color(0x4488ff), intensity: 0.5 },
  { dir: new THREE.Vector3( -5,-10, -10).normalize(), color: new THREE.Color(0xffdddd), intensity: 1.2 },
];

const DEFAULT_AMBIENT = new THREE.Color(0x404040).multiplyScalar(0.5);

// ── Residue tangent computation (for axis fade) ──────────
//    Inlined to keep the file self-contained.

function computeResidueTangents(atoms) {
  const residueTangents = new Map();
  const residues = new Map();

  for (const atom of atoms) {
    const key = (atom.chainID || '') + '_' + atom.resSeq;
    if (!residues.has(key)) residues.set(key, []);
    residues.get(key).push(atom);
  }

  for (const [key, resAtoms] of residues) {
    const ca = resAtoms.find(a => a.name === 'CA');
    if (!ca) continue;

    const [chainID, resSeqStr] = key.split('_');
    const resSeq = parseInt(resSeqStr, 10);
    const prev = residues.get(chainID + '_' + (resSeq - 1));
    const next = residues.get(chainID + '_' + (resSeq + 1));
    const prevCA = prev ? prev.find(a => a.name === 'CA') : null;
    const nextCA = next ? next.find(a => a.name === 'CA') : null;

    let T;
    if (prevCA && nextCA)  T = new THREE.Vector3(nextCA.x - prevCA.x, nextCA.y - prevCA.y, nextCA.z - prevCA.z);
    else if (prevCA)       T = new THREE.Vector3(ca.x - prevCA.x, ca.y - prevCA.y, ca.z - prevCA.z);
    else if (nextCA)       T = new THREE.Vector3(nextCA.x - ca.x, nextCA.y - ca.y, nextCA.z - ca.z);
    else                   T = new THREE.Vector3(1, 0, 0);

    residueTangents.set(key, T.normalize());
  }

  return residueTangents;
}


// ── Update params ────────────────────────────────────────

const IMPOSTER_UPDATE_PARAMS = [
  'atomRadius', 'atomOpacity', 'atomRangeStart', 'atomRangeEnd',
  'atomLightness',
  'sidechainFade', 'mainLight', 'fillLight', 'backLight'
];


// ── Node class ───────────────────────────────────────────

class ImposterAtomNode extends SceneNode {

  static rebuildParams = [];
  static updateParams = IMPOSTER_UPDATE_PARAMS;

  // ── Build ──────────────────────────────────────────────

  build(ctxMix, node, params) {
    if (this.group) return;

    this.group = new THREE.Group();
    this.mesh = null;
    this.atoms = [];
    this.totalAtomCount = 0;
    this.modelScale = 1;
    this.residueTangents = new Map();

    // Per-instance base data (set once in setData, not changed by sliders)
    this._basePositions = null;   // Float32Array, 3 per atom
    this._baseRadii     = null;   // Float32Array, 1 per atom
    this._baseColors    = null;   // Float32Array, 3 per atom

    // Apply deferred data
    if (this._pendingData) {
      const { atoms, scale, chainColorMap } = this._pendingData;
      this._pendingData = null;
      this._applyData(atoms, scale, chainColorMap);
    }
  }

  // ── Data ───────────────────────────────────────────────

  setData(atoms, scale, chainColorMap) {
    if (this.group) {
      this._applyData(atoms, scale, chainColorMap);
    } else {
      this._pendingData = { atoms, scale, chainColorMap };
    }
  }

  _applyData(atoms, scale, chainColorMap) {
    // Remove old mesh
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.group.remove(this.mesh);
      this.mesh = null;
    }

    this.atoms = [...atoms];
    this.totalAtomCount = atoms.length;
    this.modelScale = scale;

    if (atoms.length === 0) return;

    this.residueTangents = computeResidueTangents(atoms);

    // Build base arrays
    const n = atoms.length;
    this._basePositions = new Float32Array(n * 3);
    this._baseRadii     = new Float32Array(n);
    this._baseColors    = new Float32Array(n * 3);

    const color = new THREE.Color();

    for (let i = 0; i < n; i++) {
      const atom = atoms[i];
      this._basePositions[i * 3]     = atom.x;
      this._basePositions[i * 3 + 1] = atom.y;
      this._basePositions[i * 3 + 2] = atom.z;

      const element = (atom.element || 'C').toUpperCase();
      const data = CPK_ATOM_DATA[element] || CPK_ATOM_DATA['DEFAULT'];
      this._baseRadii[i] = data.radius * scale * 0.35;

      color.set(data.color);
      this._baseColors[i * 3]     = color.r;
      this._baseColors[i * 3 + 1] = color.g;
      this._baseColors[i * 3 + 2] = color.b;
    }

    // Build mesh
    this._buildMesh(n);
  }

  _buildMesh(instanceCount) {
    // Base quad: 4 verts, 2 triangles
    const quadPositions = new Float32Array([
      -1, -1, 0,
       1, -1, 0,
       1,  1, 0,
      -1,  1, 0,
    ]);
    const quadIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);

    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(quadPositions, 3));
    geometry.setIndex(new THREE.BufferAttribute(quadIndices, 1));
    geometry.instanceCount = instanceCount;

    // Per-instance attributes
    this._instancePositions = new THREE.InstancedBufferAttribute(
      new Float32Array(this._basePositions), 3
    );
    this._instanceRadii = new THREE.InstancedBufferAttribute(
      new Float32Array(instanceCount), 1
    );
    this._instanceColors = new THREE.InstancedBufferAttribute(
      new Float32Array(this._baseColors), 3
    );

    geometry.setAttribute('instancePosition', this._instancePositions);
    geometry.setAttribute('instanceRadius',   this._instanceRadii);
    geometry.setAttribute('instanceColor',    this._instanceColors);

    // Material
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: false,
      depthWrite: true,
      uniforms: {
        uOpacity:         { value: 1.0 },
        uLightness:       { value: 0.5 },
        uAmbientColor:    { value: DEFAULT_AMBIENT.clone() },
        uLightDir0:       { value: DEFAULT_LIGHTS[0].dir.clone() },
        uLightColor0:     { value: DEFAULT_LIGHTS[0].color.clone() },
        uLightIntensity0: { value: DEFAULT_LIGHTS[0].intensity },
        uLightDir1:       { value: DEFAULT_LIGHTS[1].dir.clone() },
        uLightColor1:     { value: DEFAULT_LIGHTS[1].color.clone() },
        uLightIntensity1: { value: DEFAULT_LIGHTS[1].intensity },
        uLightDir2:       { value: DEFAULT_LIGHTS[2].dir.clone() },
        uLightColor2:     { value: DEFAULT_LIGHTS[2].color.clone() },
        uLightIntensity2: { value: DEFAULT_LIGHTS[2].intensity },
      },
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
  }

  // ── Update ─────────────────────────────────────────────

  update(ctxMix, node, params) {
    if (!this.mesh || this.totalAtomCount === 0) return;

    const opacity = params.atomOpacity ?? 1;
    const atomRadius = params.atomRadius ?? 1;

    // Skip entirely when invisible
    if (opacity <= 0 || atomRadius <= 0.001) {
      if (this.mesh.parent) this.group.remove(this.mesh);
      return;
    }
    if (!this.mesh.parent) this.group.add(this.mesh);

    // Opacity (snap to opaque to avoid transparency overdraw)
    const effectiveOpacity = opacity >= 0.98 ? 1.0 : opacity;
    const mat = this.mesh.material;
    mat.uniforms.uOpacity.value = effectiveOpacity;
    mat.transparent = effectiveOpacity < 1.0;

    mat.uniforms.uLightness.value = params.atomLightness ?? 0.5;

    // Lighting intensities from params
    if (params.mainLight !== undefined) mat.uniforms.uLightIntensity0.value = params.mainLight;
    if (params.fillLight !== undefined) mat.uniforms.uLightIntensity1.value = params.fillLight;
    if (params.backLight !== undefined) mat.uniforms.uLightIntensity2.value = params.backLight;

    // Compute visible radii (atomRadius × base, zeroed for out-of-range/faded)
    this._updateRadii(atomRadius, params);
  }

  _updateRadii(atomRadius, params) {
    const n = this.totalAtomCount;
    const radii = this._instanceRadii.array;

    // Range
    const rangeStart = Math.max(0, Math.min(1, (params.atomRangeStart ?? 0) / 100));
    const rangeEnd   = Math.max(0, Math.min(1, (params.atomRangeEnd ?? 100) / 100));
    const lo = Math.floor(Math.min(rangeStart, rangeEnd) * n);
    const hi = Math.ceil(Math.max(rangeStart, rangeEnd) * n);

    // Axis fade
    const sidechainFade = params.sidechainFade || 0;
    const referenceAxis = params.referenceAxis || null;
    const useFade = referenceAxis && sidechainFade > 0;

    for (let i = 0; i < n; i++) {
      if (i < lo || i >= hi) {
        radii[i] = 0;
        continue;
      }

      if (useFade) {
        const atom = this.atoms[i];
        const key = (atom.chainID || '') + '_' + atom.resSeq;
        const T = this.residueTangents.get(key);
        if (T) {
          const dot = Math.abs(T.dot(referenceAxis));
          if (dot < sidechainFade) { radii[i] = 0; continue; }
        }
      }

      radii[i] = this._baseRadii[i] * atomRadius;
    }

    this._instanceRadii.needsUpdate = true;
  }

  // ── Depth sort ─────────────────────────────────────────
  //    Reorders all instance arrays back-to-front relative to
  //    the camera. Call on OrbitControls 'change' when transparent.
  //    For 4,500 atoms this takes ~0.1ms.

  sortInstances(camera) {
    const n = this.totalAtomCount;
    if (n === 0 || !this._basePositions) return;

    // Camera forward in world space (points into screen)
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);

    // Compute dot product (depth along view) for each atom
    const depths = new Float32Array(n);
    const bp = this._basePositions;
    for (let i = 0; i < n; i++) {
      depths[i] = bp[i * 3] * forward.x + bp[i * 3 + 1] * forward.y + bp[i * 3 + 2] * forward.z;
    }

    // Sort indices back-to-front (most negative dot = farthest = draws first)
    const indices = new Uint32Array(n);
    for (let i = 0; i < n; i++) indices[i] = i;
    indices.sort((a, b) => depths[a] - depths[b]);

    // Apply permutation to all parallel arrays
    this._permuteFloat32(this._basePositions, indices, 3);
    this._permuteFloat32(this._baseRadii, indices, 1);
    this._permuteFloat32(this._baseColors, indices, 3);
    this._permuteFloat32(this._instancePositions.array, indices, 3);
    this._permuteFloat32(this._instanceRadii.array, indices, 1);
    this._permuteFloat32(this._instanceColors.array, indices, 3);
    this._permuteObjects(this.atoms, indices);

    // Mark GPU attributes dirty
    this._instancePositions.needsUpdate = true;
    this._instanceRadii.needsUpdate = true;
    this._instanceColors.needsUpdate = true;
  }

  _permuteFloat32(arr, indices, stride) {
    const n = indices.length;
    const tmp = new Float32Array(n * stride);
    for (let i = 0; i < n; i++) {
      const src = indices[i] * stride;
      const dst = i * stride;
      for (let s = 0; s < stride; s++) {
        tmp[dst + s] = arr[src + s];
      }
    }
    arr.set(tmp);
  }

  _permuteObjects(arr, indices) {
    const tmp = new Array(indices.length);
    for (let i = 0; i < indices.length; i++) {
      tmp[i] = arr[indices[i]];
    }
    for (let i = 0; i < indices.length; i++) {
      arr[i] = tmp[i];
    }
  }

  // ── Teardown ───────────────────────────────────────────

  teardown(ctxMix, node, params) {
    this.clear();
  }

  clear() {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.group.remove(this.mesh);
      this.mesh = null;
    }
    this._basePositions = null;
    this._baseRadii = null;
    this._baseColors = null;
    this._instancePositions = null;
    this._instanceRadii = null;
    this._instanceColors = null;
    this._pendingData = null;
    this.atoms = [];
    this.totalAtomCount = 0;
    this.residueTangents = null;
    if (this.group) {
      while (this.group.children.length > 0) {
        this.group.remove(this.group.children[0]);
      }
      this.group = null;
    }
  }
}

sceneRegistry.registerNodeClass('imposter-atoms', ImposterAtomNode);

export { ImposterAtomNode };
// Auto-generated exports
if (typeof window !== 'undefined') window.DEFAULT_AMBIENT = DEFAULT_AMBIENT;
export { DEFAULT_AMBIENT };
if (typeof window !== 'undefined') window.DEFAULT_LIGHTS = DEFAULT_LIGHTS;
export { DEFAULT_LIGHTS };
if (typeof window !== 'undefined') window.FRAGMENT_SHADER = FRAGMENT_SHADER;
export { FRAGMENT_SHADER };
if (typeof window !== 'undefined') window.IMPOSTER_UPDATE_PARAMS = IMPOSTER_UPDATE_PARAMS;
export { IMPOSTER_UPDATE_PARAMS };
if (typeof window !== 'undefined') window.VERTEX_SHADER = VERTEX_SHADER;
export { VERTEX_SHADER };
if (typeof window !== 'undefined') window.computeResidueTangents = computeResidueTangents;
export { computeResidueTangents };
