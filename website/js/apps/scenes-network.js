/**
 * scenes-network.js — v2
 *
 * Network addable: linked nodes + edges as a layer pair.
 *
 * Changes from v1:
 *   - Twig protocol: addItem, removeItem, selectionInfo on layer.inst
 *   - Network-specific logic moved here from omni-scene-app.js
 *   - Uses autoName and isNodeInLayer from layer-ops.js
 *
 * Each addable declares:
 *   selectionSize  — buffer depth needed for its operations (1, 2, 3…)
 *   refCount       — how many external references needed to ADD an item
 *                    (0 = provides own points, 2 = needs two node refs, etc.)
 */

import { MiniAstNode, SCENES, ADDABLES } from '../omni-support/scene.js';
import { createItemFields } from '../omni-support/item-fields.js';
import { autoName, isNodeInLayer } from '../omni-support/layer-ops.js';
import '../nodes2d/edge-ref-node.js';

// ═══════════════════════════════════════════════════════
//  NETWORK — linked nodes + edges layer pair
// ═══════════════════════════════════════════════════════


const TRANSFORM_SLIDERS = [
  { id: 'transformSize',   label: 'size',     min: 10, max: 200, step: 1,    default: 100 },
  { id: 'transformRotate', label: 'rotate',   min: 0,  max: 360, step: 1,    default: 0 },
];

const BOND_LINE_SLIDERS = [
  { id: 'pathColor',    label: 'color',      type: 'color',    default: '#8080ffaa' },
  { id: 'pathWidth',    label: 'path width', min: 1,   max: 20,  step: 0.5, default: 4 },
  { id: 'fillOpacity',  label: 'opacity',    min: 0,   max: 1,   step: 0.01, default: 0.7 },
  { id: 'lineExtend',   label: 'extend',     min: -20, max: 40,  step: 1,    default: -12 },
  { id: 'strokeWidth',  label: 'stroke width', min: 0.5, max: 10,  step: 0.5,  default: 1 },
  { id: 'endSize',      label: 'end size',   min: 5,   max: 30,  step: 1,    default: 15 },
  { id: 'bevel',        label: 'bevel',      min: 0,   max: 20,  step: 1,    default: 0 },
  { id: 'bend',         label: 'bend',       min: -3.14/2,   max: 3.14/2,  step: 0.05,    default: 0 },
];

const LABEL_SLIDERS = [
  { id: 'fontSize',     label: 'font size',  min: 6,  max: 48,  step: 1,    default: 12 },
  { id: 'pointRadius',  label: 'atom radius', min: 4, max: 30,  step: 1,    default: 0 },
  { id: 'pad',          label: 'padding',    min: -5, max: 30,  step: 1,    default: 0 },
];

const DISPLAY_SLIDERS = [
  { id: 'moleculeMode', label: 'molecule',   min: 0,  max: 1,   step: 1,    default: 0 },
  { id: 'showAngles',   label: 'angles',     min: 0,  max: 1,   step: 1,    default: 0 },
  { id: 'showBonds',    label: 'bonds',      min: 0,  max: 1,   step: 1,    default: 1 },
];

const ZOOM_SLIDER = { id: 'zoom', label: 'zoom', min: 0.1, max: 4, step: 0.01, default: 1 };

function networkEdgesBuildUI() {
  const sections = [
    { group: 'Bond',      id: 'bond',      abbrev: 'Bnd',  sliders: BOND_LINE_SLIDERS },
  ];
  return sections;
}

function networkNodesBuildUI() {
  const sections = [
    { group: 'Label',     id: 'label',     abbrev: 'Lab',  sliders: LABEL_SLIDERS },
  ]
  return sections;
}


const NETWORK_EDGE_PRESETS = {
  'Default':  {
    transformSize: 100, transformRotate: 0,
    pathWidth: 4, lineExtend: -12, strokeWidth: 1, endSize: 15, bevel: 0,
    fontSize: 12, pointRadius: 2, pad: 0,
    moleculeMode: 0, showAngles: 0, showBonds: 1, pathColor: '#8080ffaa', fillOpacity: 0.7,
  },
  'Molecule': {
    transformSize: 100, transformRotate: 0,
    pathWidth: 3, lineExtend: 0, strokeWidth: 2, endSize: 10, bevel: 0,
    fontSize: 10, pointRadius: 14, pad: 0,
    moleculeMode: 1, showAngles: 1, showBonds: 1, pathColor: '#8080ffaa', fillOpacity: 0.7,
  },
  'Large': {
    transformSize: 150, transformRotate: 0,
    pathWidth: 4, lineExtend: -8, strokeWidth: 8, endSize: 20, bevel: 3,
    fontSize: 16, pointRadius: 0, pad: 4,
    moleculeMode: 0, showAngles: 0, showBonds: 1, pathColor: '#8080ffaa', fillOpacity: 0.7,
  },
  'Bold':    { pathWidth: 6,  pathColor: '#4fc3f7ff', fillOpacity: 0.9 },
  'Subtle':  { pathWidth: 2,  pathColor: '#ffffff44', fillOpacity: 0.4 },
  'Red':     { pathWidth: 3,  pathColor: '#ff6b6bcc', fillOpacity: 0.8 },
  'Geometry': {  },
  'Snake': {  },
  'Quads': {  },
  'Flowchart': {  },
  'Line Art': {  },
  'Generic Diagram': {  },
  'Annotated': {  },
  'Code Tiles': {  },
  'Scene Graph': {  },
  'Rainbow': {  },
  'Star Map': {  },
  'Sankey': {  },
};


// ═══════════════════════════════════════════════════════
//  DISPLAY NAME HELPER
// ═══════════════════════════════════════════════════════

/**
 * Network-prefix–aware name for a drag-point node.
 * When there are multiple networks, prefixes with the network name.
 */
function getNodeDisplayName(node, nodesLayer, app) {
  const name = node.value?.name || node.value?.uid || '?';
  const netLayers = app._contentLayers()
    .filter(l => l.value?.layerType === 'network-nodes');
  if (netLayers.length <= 1) return name;
  if (isNodeInLayer(node, nodesLayer)) {
    return `${nodesLayer.value.networkName || '?'}:${name}`;
  }
  return name;
}


// ═══════════════════════════════════════════════════════
//  TWIG PROTOCOL — network-nodes
// ═══════════════════════════════════════════════════════

/** Resolve the selected drag-point in a network-nodes layer. */
function resolveNetworkNode(layer, app) {
  const buf = app?._selectionBuffer || [];
  for (const entry of buf) {
    if (entry.node?.token === 'drag-point' && layer.subtree?.includes(entry.node)) {
      return entry.node;
    }
  }
  // Fallback: last node in layer
  const pts = (layer.subtree || []).filter(n => n.token === 'drag-point');
  return pts.length ? pts[pts.length - 1] : null;
}

const networkNodesOps = {

  addItem(layer, _buf, app) {
    const counter = layer.value._uidCounter || 0;
    const netName = layer.value.networkName || 'A';
    const uid     = netName.toLowerCase() + counter;
    const name    = autoName(layer.value._nameCounter || counter);

    layer.value._uidCounter  = counter + 1;
    layer.value._nameCounter = (layer.value._nameCounter || counter) + 1;

    // Spread new nodes in a ring pattern
    const angle  = counter * 2.399;   // golden angle
    const radius = 40 + counter * 10;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;

    const node = new MiniAstNode('drag-point', [], {
      uid, name, x, y, color: '#4fc3f7',
    });
    layer.subtree.push(node);
  },

  removeItem(layer, buf, app) {
    const entry = buf[buf.length - 1];
    if (!entry) return;
    const node = entry.node;
    const uid  = node.value?.uid;

    // Remove from nodes layer
    const idx = layer.subtree.indexOf(node);
    if (idx >= 0) layer.subtree.splice(idx, 1);

    // Cascade: remove edges referencing this node
    if (uid) {
      for (const l of app._contentLayers()) {
        if (l.value?.layerType === 'network-edges' &&
            l.value?.nodesLayer === layer) {
          l.subtree = l.subtree.filter(e =>
            e.value?.from !== uid && e.value?.to !== uid);
        }
      }
    }
  },

  selectionInfo(layer, buf, app) {
    const count = (layer.subtree || []).length;
    let display   = '—';
    let canRemove = false;

    if (buf.length >= 1) {
      const entry = buf[buf.length - 1];
      if (entry.node?.token === 'drag-point' &&
          isNodeInLayer(entry.node, layer)) {
        display   = getNodeDisplayName(entry.node, layer, app);
        canRemove = true;
      }
    }

    return { display, canAdd: true, canRemove, count };
  },
};


// ═══════════════════════════════════════════════════════
//  TWIG PROTOCOL — network-edges
// ═══════════════════════════════════════════════════════

const networkEdgesOps = {

  addItem(layer, buf, app) {
    const nodesLayer = layer.value?.nodesLayer;
    if (!nodesLayer) return;

    const valid = buf.filter(e =>
      e.node?.token === 'drag-point' && isNodeInLayer(e.node, nodesLayer));
    if (valid.length < 2) return;

    const n0 = valid[0].node, n1 = valid[1].node;
    const edge = new MiniAstNode('edge-ref', [], {
      from:     n0.value.uid,
      to:       n1.value.uid,
      fromNode: n0,
      toNode:   n1,
    });
    layer.subtree.push(edge);
  },

  removeItem(layer, buf, app) {
    const nodesLayer = layer.value?.nodesLayer;
    if (!nodesLayer) return;

    const valid = buf.filter(e =>
      e.node?.token === 'drag-point' && isNodeInLayer(e.node, nodesLayer));
    if (valid.length < 2) return;

    const uid0 = valid[0].node.value?.uid;
    const uid1 = valid[1].node.value?.uid;

    const idx = layer.subtree.findIndex(e => {
      const f = e.value?.from, t = e.value?.to;
      return (f === uid0 && t === uid1) || (f === uid1 && t === uid0);
    });
    if (idx >= 0) layer.subtree.splice(idx, 1);
  },

  selectionInfo(layer, buf, app) {
    const nodesLayer = layer.value?.nodesLayer;
    if (!nodesLayer) {
      return { display: '—', canAdd: false, canRemove: false, count: layer.subtree.length };
    }

    const count = layer.subtree.length;
    const validNodes = buf.filter(e =>
      e.node?.token === 'drag-point' && isNodeInLayer(e.node, nodesLayer));

    let display   = '— → —';
    let canAdd    = false;
    let canRemove = false;

    if (validNodes.length >= 2) {
      const n0 = validNodes[0].node, n1 = validNodes[1].node;
      display = `${getNodeDisplayName(n0, nodesLayer, app)} → ${getNodeDisplayName(n1, nodesLayer, app)}`;

      const uid0 = n0.value?.uid, uid1 = n1.value?.uid;
      const exists = layer.subtree.some(e => {
        const f = e.value?.from, t = e.value?.to;
        return (f === uid0 && t === uid1) || (f === uid1 && t === uid0);
      });
      canAdd    = !exists;
      canRemove = exists;
    } else if (validNodes.length === 1) {
      display = `${getNodeDisplayName(validNodes[0].node, nodesLayer, app)} → —`;
    }

    return { display, canAdd, canRemove, count };
  },
};


// ═══════════════════════════════════════════════════════
//  NETWORK ADDABLE
// ═══════════════════════════════════════════════════════

const NETWORK_ADDABLE = {
  id:    'network',
  label: 'Network',

  /**
   * Returns TWO layers: [nodesLayer, edgesLayer].
   * `app` is passed from addObject so we can auto-name.
   */
  create(app) {
    const netName = app?._nextNetworkName?.() || 'A';
    const lo      = netName.toLowerCase();

    const nodes = [
      new MiniAstNode('drag-point', [], { uid: lo+'0', name: 'A', x: -60, y: -30, color: '#4fc3f7' }),
      new MiniAstNode('drag-point', [], { uid: lo+'1', name: 'B', x:  60, y: -30, color: '#81c784' }),
      new MiniAstNode('drag-point', [], { uid: lo+'2', name: 'C', x:   0, y:  50, color: '#ffb74d' }),
    ];

    // per item overrides...
    const nodeFields = createItemFields({
      id: 'node-props', label: 'Node', abbrev: 'Nd',
      fields: [
        { key: 'name',  label: 'Name',  type: 'text', placeholder: 'Name' },
        { key: 'emoji', label: 'Emoji', type: 'text', placeholder: 'emoji' },
        { key: 'color', label: 'Color', type: 'color', default: '#4fc3f7' },
      ],
      resolve: resolveNetworkNode,
    });

    const nodesLayer = new MiniAstNode('layer', nodes, {
      name:        `Net ${netName} · Nodes`,
      layerType:   'network-nodes',
      visible:     true,
      networkName: netName,
      _uidCounter: 3,
      _nameCounter: 3,
      params:      { pointRadius: 8, pointColor: '#4fc3f7' },
    });
    nodesLayer.inst = {
      buildUI:       networkNodesBuildUI,
      presets:       null,
      selectionSize: 1,
      refCount:      0,
      itemFields:    nodeFields,
      // Twig protocol
      addItem:       networkNodesOps.addItem,
      removeItem:    networkNodesOps.removeItem,
      selectionInfo: networkNodesOps.selectionInfo,
    };

    const edges = [
      new MiniAstNode('edge-ref', [], { from: lo+'0', to: lo+'1', fromNode: nodes[0], toNode: nodes[1] }),
      new MiniAstNode('edge-ref', [], { from: lo+'1', to: lo+'2', fromNode: nodes[1], toNode: nodes[2] }),
    ];

    const edgesLayer = new MiniAstNode('layer', edges, {
      name:        `Net ${netName} · Edges`,
      layerType:   'network-edges',
      visible:     true,
      networkName: netName,
      nodesLayer:  nodesLayer,
      params:      { pathWidth: 4, pathColor: '#8080ffaa', fillOpacity: 0.7 },
    });
    edgesLayer.inst = {
      buildUI:       networkEdgesBuildUI,
      presets:       NETWORK_EDGE_PRESETS,
      selectionSize: 2,
      refCount:      2,
      // Twig protocol
      addItem:       networkEdgesOps.addItem,
      removeItem:    networkEdgesOps.removeItem,
      selectionInfo: networkEdgesOps.selectionInfo,
    };

    return [edgesLayer, nodesLayer];
  },
};


// ═══════════════════════════════════════════════════════
//  COMPOSED LISTS
// ═══════════════════════════════════════════════════════

ADDABLES.push(NETWORK_ADDABLE);
