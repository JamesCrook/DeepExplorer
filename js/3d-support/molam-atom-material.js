import * as THREE from 'three';

/**
 * MolamAtomMaterial — ShaderMaterial with identical lighting to ImposterAtomNode.
 *
 * Blinn-Phong with no energy-conservation divisor, shininess 30, specular 0.15.
 * Matches the imposter fragment shader exactly, so the transition between
 * imposter (opaque) and sphere (transparent) modes is seamless.
 *
 * Usage:
 *   const material = new MolamAtomMaterial(atomData.color, opacity);
 *
 *   // Update opacity later:
 *   material.setOpacity(0.5);
 *
 *   // Update lighting from slider params:
 *   material.setLighting(params.mainLight, params.fillLight, params.backLight);
 *
 * Supports per-instance colors via InstancedMesh.setColorAt() —
 * vertexColors is enabled by default.
 */

// ── Shaders ──────────────────────────────────────────────

const VERTEX_SHADER = /* glsl */ `
  out vec3 vNormal;
  out vec3 vViewPos;
  out vec3 vColor;

  void main() {
    // instanceMatrix and instanceColor are injected by THREE.js
    // for InstancedMesh — apply per-instance transform and color.
    vec4 instancePos = instanceMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
    vec4 viewPos = modelViewMatrix * instancePos;
    vViewPos = viewPos.xyz;
    vColor = instanceColor;
    gl_Position = projectionMatrix * viewPos;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform float uOpacity;
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

  in vec3 vNormal;
  in vec3 vViewPos;
  in vec3 vColor;

  out vec4 fragColor;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(-vViewPos);
    float shininess = 30.0;
    float specStrength = 0.15;

    vec3 ld0 = normalize((viewMatrix * vec4(uLightDir0, 0.0)).xyz);
    vec3 ld1 = normalize((viewMatrix * vec4(uLightDir1, 0.0)).xyz);
    vec3 ld2 = normalize((viewMatrix * vec4(uLightDir2, 0.0)).xyz);

    vec3 color = uAmbientColor * vColor;

    for (int i = 0; i < 3; i++) {
      vec3 ld  = (i == 0) ? ld0  : (i == 1) ? ld1  : ld2;
      vec3 lc  = (i == 0) ? uLightColor0 : (i == 1) ? uLightColor1 : uLightColor2;
      float li = (i == 0) ? uLightIntensity0 : (i == 1) ? uLightIntensity1 : uLightIntensity2;

      float diff = max(dot(normal, ld), 0.0);
      vec3 half_ = normalize(ld + viewDir);
      float spec = pow(max(dot(normal, half_), 0.0), shininess);
      color += (diff * vColor + spec * specStrength) * lc * li;
    }

    fragColor = vec4(color, uOpacity);
  }
`;

// ── Default lights (must match imposter-atom-node.js) ────

const DEFAULT_LIGHTS = [
  { dir: new THREE.Vector3( 5, 15,  10).normalize(), color: new THREE.Color(0xffffff), intensity: 1.2 },
  { dir: new THREE.Vector3(-10,  5,  -5).normalize(), color: new THREE.Color(0x4488ff), intensity: 0.5 },
  { dir: new THREE.Vector3( -5,-10, -10).normalize(), color: new THREE.Color(0xffdddd), intensity: 1.2 },
];

const DEFAULT_AMBIENT = new THREE.Color(0x404040).multiplyScalar(0.5);

// ── Material class ───────────────────────────────────────

class MolamAtomMaterial extends THREE.ShaderMaterial {

  constructor(color = 0xffffff, opacity = 1.0) {
    const effectiveOpacity = opacity >= 0.98 ? 1.0 : opacity;

    super({
      glslVersion: THREE.GLSL3,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: effectiveOpacity < 1.0,
      depthWrite: true,
      uniforms: {
        uOpacity:         { value: effectiveOpacity },
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

    this.vertexColors = true;

    // Store base color for non-instanced use (single mesh)
    this._baseColor = new THREE.Color(color);
  }

  setOpacity(opacity) {
    const effective = opacity >= 0.98 ? 1.0 : opacity;
    this.uniforms.uOpacity.value = effective;
    this.transparent = effective < 1.0;
  }

  setLighting(mainIntensity, fillIntensity, backIntensity) {
    if (mainIntensity !== undefined) this.uniforms.uLightIntensity0.value = mainIntensity;
    if (fillIntensity !== undefined) this.uniforms.uLightIntensity1.value = fillIntensity;
    if (backIntensity !== undefined) this.uniforms.uLightIntensity2.value = backIntensity;
  }
}

export { MolamAtomMaterial };
// Auto-generated exports
if (typeof window !== 'undefined') window.DEFAULT_AMBIENT = DEFAULT_AMBIENT;
export { DEFAULT_AMBIENT };
if (typeof window !== 'undefined') window.DEFAULT_LIGHTS = DEFAULT_LIGHTS;
export { DEFAULT_LIGHTS };
if (typeof window !== 'undefined') window.FRAGMENT_SHADER = FRAGMENT_SHADER;
export { FRAGMENT_SHADER };
if (typeof window !== 'undefined') window.VERTEX_SHADER = VERTEX_SHADER;
export { VERTEX_SHADER };
