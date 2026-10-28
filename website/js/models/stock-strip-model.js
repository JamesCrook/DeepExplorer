import { SYS } from '../omni-support/sys.js';
import { EdgeSnapController } from '../2d-support/edge-snap-controller.js';
import { makeZoomableCamera } from '../2d-support/make-camera.js';
import { PipperNode } from '../nodes2d/pipper-node.js';
import { RaftSnapController } from '../2d-support/raft-snap-controller.js';
import '../nodes2d/button-node.js';
import '../nodes2d/fracture-cone-node.js';   // 'fracture-cone'
import '../nodes2d/stock-strip-node.js';   // 'stock-strip'
import '../nodes2d/word-node.js';   // 'word-node'
export { StockStripModel };
class StockStripModel {
  get name() { return 'Stock Strip · Scene Graph'; }
  get displayType() { return '2d'; }
  get stockStripHeight() { return 170; }
  setArena( scene ){
    PipperNode.loadScene(this.arenaNode, scene, {});
    this.harness.draw();
  }
  constructor() {
    this.visible = true;
    this.controls = [];

    const models = SYS.MODELS.filter(m => m.getScene);
    const modelControls = models.map(m => ({ type: 'button', label: m.name, cls: m.btnClass, action: () => { this.setArena( m.getScene() )} }));

    this.controls.push(
      { type: 'separator', label: 'Model' },
      ...modelControls,
      { type: 'separator', label: 'Display' },
      { id: 'stripOpacity',     label: 'Strip Opacity', min: 0, max: 100, step: 1, value: SYS.P.stripOpacity || 100 },
      { type: 'checkbox', id: 'showHints', label: 'Show Hints', value: true },
      );
    this.edgeSnapController = typeof EdgeSnapController !== 'undefined' ? new EdgeSnapController() : null;
    this.raftSnapController = typeof RaftSnapController !== 'undefined' ? new RaftSnapController() : null;

    const arena = SYS.makeNode('pipper-node', {});
    arena.inst = {
      controllers: [
        this.edgeSnapController,
        this.raftSnapController,
      ].filter(Boolean),
    };
    arena.subtree = [
      SYS.makeNode('button-node', { x: -90, y: -40, width: 64, height: 64, label: 'あ', sub: 'a' }),
      SYS.makeNode('button-node', { x:  90, y: -40, width: 64, height: 64, label: 'う', sub: 'u' }),
      SYS.makeNode('button-node', { x:   0, y:  40, width: 64, height: 64, label: 'お', sub: 'o', color: '#8b6b4a', badge: 3 }),
    ];
    this.arenaNode = arena;
    const coneNode = SYS.makeNode('fracture-cone', {});
    coneNode.inst = { target: arena };
    const cam = makeZoomableCamera(
      SYS.makeNode('group', {}, [arena, coneNode]),
      { centerOrigin: true }
      );
    this.cameraNode = cam;
    const stock = SYS.makeNode('stock-strip', { height: 170 });
    stock.inst = { arenaNode: arena, cameraNode: cam };
    stock.subtree = [ 
      { type: 'word-node', value: { x:   80, y: 80, text: 'One',    fontSize: 32, fontWeight: 800, color: '#e4dac6' } },
      { type: 'word-node', value: { x:   480, y: 80, text: 'Word',   fontSize: 32, fontWeight: 800, color: '#e42a26' } },
      ...SYS.STOCK,
    ];

    const top   = SYS.makeNode('group', {});
    top.subtree = [ stock, cam ];

    this.sceneRoot = top;

    this.controls.push(
      ...SYS.CONTROLS,
      );
  }

  onControl(id, val, getValues, app) {
    if (id === 'enableEdgeSnap' || id === 'enableRaftSnap') {
      const v = getValues();
      this.arenaNode.inst.controllers = [
        v.enableEdgeSnap !== false && this.edgeSnapController,
        v.enableRaftSnap !== false && this.raftSnapController,
      ].filter(Boolean);
    }
  }
}
SYS.MODELS.push(new StockStripModel());
