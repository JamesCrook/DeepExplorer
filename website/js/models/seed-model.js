import { SYS } from '../omni-support/sys.js';
import { Geo } from '../2d-support/geo.js';
import { Values } from '../omni-support/values.js';
import { BasicCollectionNode } from '../nodes2d/basic-collection-node.js';
import { EdgeSnapController } from '../2d-support/edge-snap-controller.js';
import { makeZoomableCamera } from '../2d-support/make-camera.js';
import { PippedPolygonNode } from '../nodes2d/pipped-polygon-node.js';
import { PipperNode } from '../nodes2d/pipper-node.js';
import { RaftSnapController } from '../2d-support/raft-snap-controller.js';
import '../nodes2d/fracture-cone-node.js';   // 'fracture-cone'
export { SeedModel };

// Model '2D Raft' — polygon tiles whose pips snap together into rafts, which fracture along a cone

class SeedModel{
  get name() { return '2D Raft'; }
  get btnClass() { return 'green'; }
  get displayType() { return '2d'; }

  constructor() {
    this.visible = true;
    const scene = this.getScene();
    
    const arena = SYS.makeNode('pipper-node', {});
    arena.inst = {
      controllers: [
        typeof EdgeSnapController !== 'undefined' ? new EdgeSnapController() : null,
        typeof RaftSnapController !== 'undefined' ? new RaftSnapController() : null,
      ].filter(Boolean),
    };
    PipperNode.loadScene(arena, scene, {});

    const coneNode = SYS.makeNode('fracture-cone', {});
    coneNode.inst = { target: arena };
    const cam = makeZoomableCamera(
      SYS.makeNode('group', {}, [arena, coneNode]),
      { centerOrigin: true }
    );
    this.sceneRoot = cam;
  }
  getScene() {
    const group = SYS.makeNode('group', { connections: [] });
    const step = SYS.R * Math.cos(Math.PI / 4) * 2;
    const sub = group.subtree;
    const dim = 2;

    for (let row = -dim; row <= dim; row++) {
      for (let col = -dim; col <= dim; col++) {
        sub.push(SYS.makeNode('pipped-polygon', { x: col * step, y: row * step, 
          r: SYS.R, n: 4, tilt: Math.PI / 4 }));
      }
    }
    BasicCollectionNode._sortSubtree(sub);

    this._makeConnections(group);
    return group;
  }

  // Emits id-based specs, the same form the PEG parser produces.
  // The arena resolves them to references; the ids do not outlive the load.
  _makeConnections(group){
    const conns = group.value.connections;
    const nodes = group.subtree.filter(n => n.type === 'pipped-polygon');
    const taken = new Set();
    const key = (n, pip) => `${n.value.id}:${pip}`;

// Auto-connect properly positioned starter tiles
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const ap = PippedPolygonNode.getPips(Values, nodes[i], {});
        const bp = PippedPolygonNode.getPips(Values, nodes[j], {});
        for (let ai = 0; ai < ap.length; ai++) {
          for (let bi = 0; bi < bp.length; bi++) {
            if (!Geo.pipsOpposite(ap[ai].out, bp[bi].out)) continue;
            if (Geo.dist(ap[ai], bp[bi]) >= 2) continue;
            if (taken.has(key(nodes[i], ai)) || taken.has(key(nodes[j], bi))) continue;
            taken.add(key(nodes[i], ai));
            taken.add(key(nodes[j], bi));
            conns.push({ a: nodes[i].value.id, pipA: ai, b: nodes[j].value.id, pipB: bi });
          }
        }
      }
    }
  }
}
SYS.MODELS.push( new SeedModel() )
