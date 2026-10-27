import { SYS, sceneRegistry } from '../omni-support/sys.js';
import { THREE } from '../3d-support/three-boot.js';
export { BOND_BLACK, BOND_RING_PINK, BOND_WHITE, CPK_ATOM_DATA, ImposterAtomNode, NEUTRAL_CHAIN_COLOR, computeResidueTangents, getResidueColor };
const CPK_ATOM_DATA = {
  'C':       { color: 0x909090, radius: 1.70, atomicNumber:  6 },
  'N':       { color: 0x3050F8, radius: 1.55, atomicNumber:  7 },
  'O':       { color: 0xFF0D0D, radius: 1.52, atomicNumber:  8 },
  'S':       { color: 0xFFFF30, radius: 1.80, atomicNumber: 16 },
  'H':       { color: 0xFFFFFF, radius: 1.20, atomicNumber:  1 },
  'DEFAULT': { color: 0xFF1493, radius: 1.50, atomicNumber:  0 },
};
const BOND_BLACK = 0x000000; const BOND_WHITE = 0xFFFFFF; const BOND_RING_PINK = 0xFF1493;
const NEUTRAL_CHAIN_COLOR = 0x908882;

function getResidueColor(atom, params, chainColor, _THREE) { return new _THREE.Color(chainColor); }

function computeResidueTangents(atoms) {
  const residueTangents = new Map(), residues = new Map();
  for (const atom of atoms) {
    const key = (atom.chainID || '') + '_' + atom.resSeq;
    if (!residues.has(key)) residues.set(key, []);
    residues.get(key).push(atom);
  }
  for (const [key, resAtoms] of residues) {
    const ca = resAtoms.find(a => a.name === 'CA');
    if (!ca)
      continue;
    const [chainID, resSeqStr] = key.split('_'), resSeq = parseInt(resSeqStr, 10);
    const prev = residues.get(chainID + '_' + (resSeq - 1)), next = residues.get(chainID + '_' + (resSeq + 1));
    const prevCA = prev ? prev.find(a => a.name === 'CA') : null, nextCA = next ? next.find(a => a.name === 'CA') : null;
    let T;
    if (prevCA && nextCA) T = new THREE.Vector3(nextCA.x - prevCA.x, nextCA.y - prevCA.y, nextCA.z - prevCA.z);
    else if (prevCA) T = new THREE.Vector3(ca.x - prevCA.x, ca.y - prevCA.y, ca.z - prevCA.z);
    else if (nextCA) T = new THREE.Vector3(nextCA.x - ca.x, nextCA.y - ca.y, nextCA.z - ca.z);
    else T = new THREE.Vector3(1, 0, 0);
    residueTangents.set(key, T.normalize());
  }
  return residueTangents;
}

const VERTEX_SHADER = `
in vec3 instancePosition; in float instanceRadius; in vec3 instanceColor;
out vec3 vViewCenter; out float vRadius; out vec3 vColor; out vec3 vFragViewPos;
void main() {
  vColor = instanceColor; vRadius = instanceRadius;
  vec4 viewCenter = modelViewMatrix * vec4(instancePosition, 1.0);
  vViewCenter = viewCenter.xyz;
  vec3 viewPos = viewCenter.xyz + vec3(position.xy * instanceRadius * 1.3, 0.0);
  vFragViewPos = viewPos;
  gl_Position = projectionMatrix * vec4(viewPos, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;
uniform mat4 projectionMatrix;
uniform float uOpacity; uniform float uLightness; uniform vec3 uAmbientColor;
uniform vec3 uLightDir0; uniform vec3 uLightColor0; uniform float uLightIntensity0;
uniform vec3 uLightDir1; uniform vec3 uLightColor1; uniform float uLightIntensity1;
uniform vec3 uLightDir2; uniform vec3 uLightColor2; uniform float uLightIntensity2;
in vec3 vViewCenter; in float vRadius; in vec3 vColor; in vec3 vFragViewPos;
out vec4 fragColor;
void main() {
  if (vRadius <= 0.0) discard;
  vec3 rayDir = normalize(vFragViewPos); vec3 oc = -vViewCenter;
  float b = dot(oc, rayDir); float c = dot(oc, oc) - vRadius * vRadius;
  float disc = b * b - c;
  if (disc < 0.0) discard;
  float t = -b - sqrt(disc); if (t < 0.0) discard;
  vec3 hitPoint = rayDir * t; vec3 normal = normalize(hitPoint - vViewCenter);
  vec4 clipPos = projectionMatrix * vec4(hitPoint, 1.0);
  gl_FragDepth = (clipPos.z / clipPos.w) * 0.5 + 0.5;
  vec3 ld0 = normalize((viewMatrix * vec4(uLightDir0, 0.0)).xyz);
  vec3 ld1 = normalize((viewMatrix * vec4(uLightDir1, 0.0)).xyz);
  vec3 ld2 = normalize((viewMatrix * vec4(uLightDir2, 0.0)).xyz);
  vec3 viewDir = normalize(-hitPoint);
  float shininess = 30.0; float specStrength = 0.15;
  vec3 effectiveColor = vColor;
  if (uLightness < 0.5) { effectiveColor = mix(effectiveColor, vec3(0.0), 1.0 - uLightness * 2.0); }
  else { effectiveColor = mix(effectiveColor, vec3(1.0), uLightness * 2.0 - 1.0); }
  vec3 color = uAmbientColor * effectiveColor;
  for (int i = 0; i < 3; i++) {
    vec3 ld = (i == 0) ? ld0 : (i == 1) ? ld1 : ld2;
    vec3 lc = (i == 0) ? uLightColor0 : (i == 1) ? uLightColor1 : uLightColor2;
    float li = (i == 0) ? uLightIntensity0 : (i == 1) ? uLightIntensity1 : uLightIntensity2;
    float diff = max(dot(normal, ld), 0.0); vec3 half_ = normalize(ld + viewDir);
    float spec = pow(max(dot(normal, half_), 0.0), shininess);
    color += (diff * effectiveColor + spec * specStrength) * lc * li;
  }
  fragColor = vec4(color, uOpacity);
}
`;

function getDefaultAmbient() { return new THREE.Color(0x404040).multiplyScalar(0.5); }
function getDefaultLights() {
  return [
    { dir: new THREE.Vector3( 5, 15,  10).normalize(), color: new THREE.Color(0xffffff), intensity: 1.2 },
    { dir: new THREE.Vector3(-10,  5,  -5).normalize(), color: new THREE.Color(0x4488ff), intensity: 0.5 },
    { dir: new THREE.Vector3( -5,-10, -10).normalize(), color: new THREE.Color(0xffdddd), intensity: 1.2 },
  ];
}

class ImposterAtomNode {
  static build3d(ctxMix, node, params) {
    if (node.value.group) return;
    const v = node.value;
    v.group = new THREE.Group();
    v.mesh = null; v.atoms = []; v.totalAtomCount = 0; v.modelScale = 1;
    v.residueTangents = new Map();
    v._basePositions = null; v._baseRadii = null; v._baseColors = null;
    if (v._pendingData) {
      const { atoms, scale, chainColorMap } = v._pendingData;
      v._pendingData = null;
      ImposterAtomNode._applyData(node, atoms, scale, chainColorMap);
    }
  }

  static setData(node, atoms, scale, chainColorMap) {
    if (node.value.group) ImposterAtomNode._applyData(node, atoms, scale, chainColorMap);
    else node.value._pendingData = { atoms, scale, chainColorMap };
  }

  static _applyData(node, atoms, scale, chainColorMap) {
    const v = node.value;
    if (v.mesh) { v.mesh.geometry.dispose(); v.group.remove(v.mesh); v.mesh = null; }
    v.atoms = [...atoms]; v.totalAtomCount = atoms.length; v.modelScale = scale;
    if (atoms.length === 0) return;
    v.residueTangents = computeResidueTangents(atoms);
    const n = atoms.length;
    v._basePositions = new Float32Array(n * 3);
    v._baseRadii = new Float32Array(n);
    v._baseColors = new Float32Array(n * 3);
    const color = new THREE.Color();
    for (let i=0; i<n; i++) {
      const atom = atoms[i];
      v._basePositions[i*3] = atom.x; v._basePositions[i*3+1] = atom.y; v._basePositions[i*3+2] = atom.z;
      const element = (atom.element || 'C').toUpperCase();
      const data = CPK_ATOM_DATA[element] || CPK_ATOM_DATA['DEFAULT'];
      v._baseRadii[i] = data.radius * scale * 0.35;
      color.set(data.color);
      v._baseColors[i*3] = color.r; v._baseColors[i*3+1] = color.g; v._baseColors[i*3+2] = color.b;
    }
    ImposterAtomNode._buildMesh(node, n);
  }

  static _buildMesh(node, instanceCount) {
    const v = node.value;
    const quadPositions = new Float32Array([-1,-1,0, 1,-1,0, 1,1,0, -1,1,0]);
    const quadIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(quadPositions, 3));
    geometry.setIndex(new THREE.BufferAttribute(quadIndices, 1));
    geometry.instanceCount = instanceCount;
    v._instancePositions = new THREE.InstancedBufferAttribute(new Float32Array(v._basePositions), 3);
    v._instanceRadii = new THREE.InstancedBufferAttribute(new Float32Array(instanceCount), 1);
    v._instanceColors = new THREE.InstancedBufferAttribute(new Float32Array(v._baseColors), 3);
    geometry.setAttribute('instancePosition', v._instancePositions);
    geometry.setAttribute('instanceRadius', v._instanceRadii);
    geometry.setAttribute('instanceColor', v._instanceColors);
    const ambient = getDefaultAmbient(), lights = getDefaultLights();
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERTEX_SHADER, fragmentShader: FRAGMENT_SHADER,
      transparent: false, depthWrite: true,
      uniforms: {
        uOpacity: { value: 1.0 }, uLightness: { value: 0.5 }, uAmbientColor: { value: ambient.clone() },
        uLightDir0: { value: lights[0].dir.clone() }, uLightColor0: { value: lights[0].color.clone() }, uLightIntensity0: { value: lights[0].intensity },
        uLightDir1: { value: lights[1].dir.clone() }, uLightColor1: { value: lights[1].color.clone() }, uLightIntensity1: { value: lights[1].intensity },
        uLightDir2: { value: lights[2].dir.clone() }, uLightColor2: { value: lights[2].color.clone() }, uLightIntensity2: { value: lights[2].intensity }
      }
    });
    v.mesh = new THREE.Mesh(geometry, material);
    v.mesh.frustumCulled = false;
    v.group.add(v.mesh);
  }

  static update3d(ctxMix, node, params) {
    const v = node.value;
    if (!v.mesh || v.totalAtomCount === 0) return;
    const opacity = params.atomOpacity ?? 1, atomRadius = params.atomRadius ?? 1;
    if (opacity <= 0 || atomRadius <= 0.001) {
      if (v.mesh.parent) v.group.remove(v.mesh);
      return;
    }
    if (!v.mesh.parent) v.group.add(v.mesh);
    const effectiveOpacity = opacity >= 0.98 ? 1.0 : opacity;
    const mat = v.mesh.material;
    mat.uniforms.uOpacity.value = effectiveOpacity;
    mat.transparent = effectiveOpacity < 1.0;
    mat.uniforms.uLightness.value = params.atomLightness ?? 0.5;
    if (params.mainLight !== undefined) mat.uniforms.uLightIntensity0.value = params.mainLight;
    if (params.fillLight !== undefined) mat.uniforms.uLightIntensity1.value = params.fillLight;
    if (params.backLight !== undefined) mat.uniforms.uLightIntensity2.value = params.backLight;
    ImposterAtomNode._updateRadii(node, atomRadius, params);
  }

  static _updateRadii(node, atomRadius, params) {
    const v = node.value, n = v.totalAtomCount, radii = v._instanceRadii.array;
    const rangeStart = Math.max(0, Math.min(1, (params.atomRangeStart ?? 0) / 100));
    const rangeEnd = Math.max(0, Math.min(1, (params.atomRangeEnd ?? 100) / 100));
    const lo = Math.floor(Math.min(rangeStart, rangeEnd) * n), hi = Math.ceil(Math.max(rangeStart, rangeEnd) * n);
    const sidechainFade = params.sidechainFade || 0, referenceAxis = params.referenceAxis || null, useFade = referenceAxis && sidechainFade > 0;
    for (let i = 0; i < n; i++) {
      if (i < lo || i >= hi) { 
        radii[i] = 0;
        continue; 
      }
      if (useFade) {
        const atom = v.atoms[i], key = (atom.chainID || '') + '_' + atom.resSeq;
        const T = v.residueTangents.get(key);
        if (T) {
          const dot = Math.abs(T.dot(referenceAxis));
          if (dot < sidechainFade) { 
            radii[i] = 0;
            continue; 
          }
        }
      }
      radii[i] = v._baseRadii[i] * atomRadius;
    }
    v._instanceRadii.needsUpdate = true;
  }
}
SYS.NODE_CLASSES.push({ name: 'imposter-atom', cls: ImposterAtomNode });;
