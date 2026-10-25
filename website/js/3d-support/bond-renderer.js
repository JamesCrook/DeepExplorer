import { BOND_BLACK, BOND_RING_PINK, BOND_WHITE, CPK_ATOM_DATA, NEUTRAL_CHAIN_COLOR, computeResidueTangents, getResidueColor } from '../nodes3d/imposter-atom-node-zones.js';
export { BondRenderer };
class BondRenderer {
  constructor(_THREE, sceneManager) {
    this.THREE = _THREE; this.sceneManager = sceneManager;
    this.bonds = []; this.bondMesh = null; this.atoms = []; this.atomRangeStart = 0; this.atomRangeEnd = 1;
    this.totalAtomCount = 0; this.opacity = 1; this.radius = 0.1; this.halfColor = 0.5; this.bondLightness = 0;
    this.ringPink = 0; this.modelScale = 1; this.sidechainFade = 0; this.referenceAxis = null;
    this.residueTangents = new Map();
    this._matrix = null; this._position = null; this._quaternion = null; this._scale = null; this._yAxis = null; this._hiddenMatrix = null;
  }
  _initTransformObjects() {
    if (!this._matrix) {
      this._matrix = new this.THREE.Matrix4(); this._position = new this.THREE.Vector3();
      this._quaternion = new this.THREE.Quaternion(); this._scale = new this.THREE.Vector3();
      this._yAxis = new this.THREE.Vector3(0, 1, 0);
      const dummy = new this.THREE.Object3D(); dummy.scale.set(0, 0, 0); dummy.updateMatrix();
      this._hiddenMatrix = dummy.matrix.clone();
    }
  }
  setFade(fade, referenceAxis) { this.sidechainFade = fade || 0; this.referenceAxis = referenceAxis; this.updateVisibility(); }
  detectAndSetBonds(atoms, scale, chainColors) {
    this.chainColors = chainColors || new Map(); this.clear();
    this.atoms = atoms; this.totalAtomCount = atoms.length; this.modelScale = scale;
    if (atoms.length === 0) return;
    this.residueTangents = computeResidueTangents(atoms);
    this.bonds = this.detectBonds(atoms);
    if (this.bonds.length > 0) { this.detectRings(); this.createBondGeometry(); }
  }
  detectBonds(atoms) {
    const BOND_CUTOFF = 1.9, CELL_SIZE = 2.0, bonds = [], grid = new Map();
    const scaledCellSize = CELL_SIZE * this.modelScale;
    atoms.forEach((atom, index) => {
      const cellX = Math.floor(atom.x / scaledCellSize), cellY = Math.floor(atom.y / scaledCellSize), cellZ = Math.floor(atom.z / scaledCellSize);
      const key = `${cellX},${cellY},${cellZ}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(index);
    });
    const scaledCutoffSq = Math.pow(BOND_CUTOFF * this.modelScale, 2), checked = new Set();
    atoms.forEach((atom1, i) => {
      const cellX = Math.floor(atom1.x / scaledCellSize), cellY = Math.floor(atom1.y / scaledCellSize), cellZ = Math.floor(atom1.z / scaledCellSize);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            const neighbors = grid.get(`${cellX + dx},${cellY + dy},${cellZ + dz}`);
            if (!neighbors)
              continue;
            for (const j of neighbors) {
              if (j <= i)
                continue;
              const pairKey = `${i},${j}`;
              if (checked.has(pairKey))
                continue;
              checked.add(pairKey);
              const atom2 = atoms[j];
              if (atom1.element === 'H' || atom2.element === 'H')
                continue;
              const dx2 = atom2.x - atom1.x, dy2 = atom2.y - atom1.y, dz2 = atom2.z - atom1.z;
              const distSq = dx2 * dx2 + dy2 * dy2 + dz2 * dz2;
              if (distSq <= scaledCutoffSq && distSq > 0.01) {
                bonds.push({ atomIndex1: i, atomIndex2: j, element1: atom1.element || 'C', element2: atom2.element || 'C' });
              }
            }
          }
        }
      }
    });
    return bonds;
  }
  detectRings() {
    const adjacency = new Map();
    this.bonds.forEach((bond, bondIndex) => {
      const a1 = bond.atomIndex1, a2 = bond.atomIndex2;
      if (!adjacency.has(a1)) adjacency.set(a1, []);
      if (!adjacency.has(a2)) adjacency.set(a2, []);
      adjacency.get(a1).push({ neighbor: a2, bondIndex });
      adjacency.get(a2).push({ neighbor: a1, bondIndex });
    });
    const ringBonds = new Set();
    this.bonds.forEach((bond, bondIndex) => {
      const start = bond.atomIndex1, end = bond.atomIndex2;
      const queue = [{ atom: end, path: [end], bondPath: [] }], visited = new Set([end]);
      while (queue.length > 0) {
        const { atom, path, bondPath } = queue.shift();
        if (atom === start && path.length >= 2) {
          if (path.length === 5 || path.length === 6) {
            ringBonds.add(bondIndex); bondPath.forEach(bi => ringBonds.add(bi));
          }
          break;
        }
        if (path.length > 6)
          continue;
        for (const { neighbor, bondIndex: bi } of (adjacency.get(atom) || [])) {
          if (bi === bondIndex || visited.has(neighbor))
            continue;
          visited.add(neighbor);
          queue.push({ atom: neighbor, path: [...path, neighbor], bondPath: [...bondPath, bi] });
        }
      }
    });
    this.bonds.forEach((bond, index) => { bond.isRing = ringBonds.has(index); });
  }
  createBondGeometry() {
    if (this.bonds.length === 0) return;
    const instanceCount = this.bonds.length * 2;
    const geometry = new this.THREE.CylinderGeometry(this.radius * this.modelScale * 0.1, this.radius * this.modelScale * 0.1, 1.0, 8, 1, true);
    const material = new this.THREE.MeshPhongMaterial({ shininess: 30, transparent: this.opacity < 1, opacity: this.opacity, side: this.THREE.FrontSide });
    this.bondMesh = new this.THREE.InstancedMesh(geometry, material, instanceCount);
    this.bondMesh.frustumCulled = false;
    this.bondMesh.userData.bonds = this.bonds;
    this._initTransformObjects();
    this.updateAllBondInstances();
  }
  bondColor(bond, baseColor, atom) {
    let color = new this.THREE.Color(baseColor);
    if (this.params && this.params.bondColorByAminoAcid > 0 && atom) {
      const ribbonColor = getResidueColor(atom, this.params, NEUTRAL_CHAIN_COLOR, this.THREE);
      color.lerp(ribbonColor, this.params.bondColorByAminoAcid);
    }
    let lightness = this.params?.bondLightness ?? 0.5;
    if( lightness < 0.5 ) color.lerp(new this.THREE.Color(BOND_BLACK), 1 - lightness * 2);
    else color.lerp(new this.THREE.Color(BOND_WHITE), lightness * 2 -1);
    let ringPink = this.params?.bondRingPink ?? 0;
    if (bond.isRing && ringPink > 0) color.lerp(new this.THREE.Color(BOND_RING_PINK), ringPink);
    return color;
  }
  setBondInstance(bondIndex, visible = true) {
    const bond = this.bonds[bondIndex], atom1 = this.atoms[bond.atomIndex1], atom2 = this.atoms[bond.atomIndex2];
    let dotVisible = true;
    if (this.referenceAxis && this.sidechainFade > 0) {
      const t1 = this.residueTangents.get((atom1.chainID || '') + '_' + atom1.resSeq);
      const t2 = this.residueTangents.get((atom2.chainID || '') + '_' + atom2.resSeq);
      let dot = 1.0;
      if (t1 && t2) dot = (Math.abs(t1.dot(this.referenceAxis)) + Math.abs(t2.dot(this.referenceAxis))) / 2;
      else if (t1) dot = Math.abs(t1.dot(this.referenceAxis));
      else if (t2) dot = Math.abs(t2.dot(this.referenceAxis));
      dotVisible = dot >= this.sidechainFade;
    }
    if (!visible || !dotVisible) {
      this.bondMesh.setMatrixAt(bondIndex * 2, this._hiddenMatrix);
      this.bondMesh.setMatrixAt(bondIndex * 2 + 1, this._hiddenMatrix);
      return;
    }
    const start = new this.THREE.Vector3(atom1.x, atom1.y, atom1.z), end = new this.THREE.Vector3(atom2.x, atom2.y, atom2.z);
    const direction = new this.THREE.Vector3().subVectors(end, start).normalize();
    this._quaternion.setFromUnitVectors(this._yAxis, direction);
    const data1 = CPK_ATOM_DATA[bond.element1.toUpperCase()] || CPK_ATOM_DATA['DEFAULT'];
    const data2 = CPK_ATOM_DATA[bond.element2.toUpperCase()] || CPK_ATOM_DATA['DEFAULT'];
    const isAtom1Lower = data1.atomicNumber <= data2.atomicNumber;
    const lowerData = isAtom1Lower ? data1 : data2, higherData = isAtom1Lower ? data2 : data1;
    const lowerStart = isAtom1Lower ? start : end, higherStart = isAtom1Lower ? end : start;
    const splitPoint = new this.THREE.Vector3().lerpVectors(lowerStart, higherStart, this.halfColor);
    const length1 = lowerStart.distanceTo(splitPoint);
    this._position.lerpVectors(lowerStart, splitPoint, 0.5);
    this._scale.set(1, length1, 1);
    this._matrix.compose(this._position, this._quaternion, this._scale);
    this.bondMesh.setMatrixAt(bondIndex * 2, this._matrix);
    this.bondMesh.setColorAt(bondIndex * 2, this.bondColor(bond, lowerData.color, isAtom1Lower ? atom1 : atom2));
    const length2 = splitPoint.distanceTo(higherStart);
    this._position.lerpVectors(splitPoint, higherStart, 0.5);
    this._scale.set(1, length2, 1);
    this._matrix.compose(this._position, this._quaternion, this._scale);
    this.bondMesh.setMatrixAt(bondIndex * 2 + 1, this._matrix);
    this.bondMesh.setColorAt(bondIndex * 2 + 1, this.bondColor(bond, higherData.color, isAtom1Lower ? atom2 : atom1));
  }
  updateAllBondInstances() {
    if (!this.bondMesh || this.bonds.length === 0) return;
    for (let i = 0; i < this.bonds.length; i++) this.setBondInstance(i, true);
      this.bondMesh.instanceMatrix.needsUpdate = true;
    if (this.bondMesh.instanceColor) this.bondMesh.instanceColor.needsUpdate = true;
  }
  updateBondRadius(radius) {
    this.radius = radius;
    if (!this.bondMesh || this.bonds.length === 0) return;
    this.bondMesh.geometry.dispose();
    this.bondMesh.geometry = new this.THREE.CylinderGeometry(radius * this.modelScale * 0.1, radius * this.modelScale * 0.1, 1.0, 8, 1, true);
    this.updateVisibility();
  }
  setOpacity(opacity) { this.opacity = opacity; this.updateVisibility(); }
  setRadius(radius) { this.updateBondRadius(radius); }
  setHalfColor(halfColor) {
    this.halfColor = halfColor;
    if (this.bondMesh) { this.updateAllBondInstances(); this.updateVisibility(); }
  }
  setbondLightness(bondLightness) {
    this.bondLightness = bondLightness;
    if (this.bondMesh) { this.updateAllBondInstances(); this.updateVisibility(); }
  }
  setRingPink(ringPink) {
    this.ringPink = ringPink;
    if (this.bondMesh) { this.updateAllBondInstances(); this.updateVisibility(); }
  }
  setAtomRange(startPercent, endPercent) {
    this.atomRangeStart = Math.max(0, Math.min(1, startPercent / 100));
    this.atomRangeEnd = Math.max(0, Math.min(1, endPercent / 100));
    this.updateVisibility();
  }
  updateVisibility() {
    if (!this.bondMesh) return;
    this.sceneManager.remove(this.bondMesh);
    if (this.opacity <= 0 || this.bonds.length === 0) return;
    const start = Math.min(this.atomRangeStart, this.atomRangeEnd), end = Math.max(this.atomRangeStart, this.atomRangeEnd);
    const startIndex = Math.floor(start * this.totalAtomCount), endIndex = Math.ceil(end * this.totalAtomCount);
    let visibleCount = 0;
    for (let i = 0; i < this.bonds.length; i++) {
      const bond = this.bonds[i];
      const atom1InRange = bond.atomIndex1 >= startIndex && bond.atomIndex1 < endIndex;
      const atom2InRange = bond.atomIndex2 >= startIndex && bond.atomIndex2 < endIndex;
      const visible = atom1InRange && atom2InRange;
      this.setBondInstance(i, visible);
      if (visible) visibleCount++;
    }
    this.bondMesh.instanceMatrix.needsUpdate = true;
    if (this.bondMesh.instanceColor) this.bondMesh.instanceColor.needsUpdate = true;
    let transparent = this.opacity < 0.98;
    this.bondMesh.material.opacity = transparent ? this.opacity : 1.0;
    this.bondMesh.material.transparent = transparent;
    this.bondMesh.material.needsUpdate = true;
    if (visibleCount > 0) this.sceneManager.add(this.bondMesh);
  }
  clear() {
    if (this.bondMesh) {
      this.bondMesh.geometry.dispose(); this.bondMesh.material.dispose();
      this.sceneManager.remove(this.bondMesh); this.bondMesh = null;
    }
    this.bonds = []; this.atoms = []; this.totalAtomCount = 0;
  }
}
