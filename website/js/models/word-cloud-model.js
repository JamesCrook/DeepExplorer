import { SYS } from '../omni-support/sys.js';
import { makeZoomableCamera } from '../2d-support/make-camera.js';
import '../nodes2d/word-node.js';   // 'word-node'
export { WordCloudModel };
class WordCloudModel {
  get name() { return 'Word Cloud'; }
  get displayType() { return '2d'; }
  constructor() {
    this.visible = true;
    const group = SYS.makeNode('group', {});
    const oldNodes = [
      { type: 'word-node', value: { x:   0, y: -80, text: 'canvas',    fontSize: 52, fontWeight: 800, color: '#e4dac6' } },
      { type: 'word-node', value: { x: 150, y: -30, text: 'scene',     fontSize: 38, fontWeight: 700, color: '#8bb8d0' } },
      { type: 'word-node', value: { x:-160, y: -20, text: 'node',      fontSize: 44, fontWeight: 700, color: '#d4a56a' } },
      { type: 'word-node', value: { x: -60, y:  30, text: 'render',    fontSize: 34, fontWeight: 600, color: '#a0c4a8' } },
      { type: 'word-node', value: { x: 100, y:  50, text: 'transform', fontSize: 28, fontWeight: 600, color: '#c898b8' } },
      { type: 'word-node', value: { x:-140, y:  80, text: 'draw',      fontSize: 40, fontWeight: 700, color: '#e07050', rotation: -12 } },
      { type: 'word-node', value: { x:  40, y: 110, text: 'zoom',      fontSize: 22, fontWeight: 500, color: '#7a9a6a' } },
      { type: 'word-node', value: { x: 180, y: 100, text: 'pixel',     fontSize: 26, fontWeight: 600, color: '#6a8cae', rotation: 8 } },
      { type: 'word-node', value: { x: -30, y:-140, text: 'graph',     fontSize: 30, fontWeight: 700, color: '#c8b070', rotation: -5 } },
      { type: 'word-node', value: { x:-180, y:-100, text: 'bevel',     fontSize: 20, fontWeight: 500, color: '#888070' } },
      { type: 'word-node', value: { x: 200, y: -90, text: 'hit',       fontSize: 24, fontWeight: 600, color: '#d07070' } },
      { type: 'word-node', value: { x:-100, y: 140, text: 'nugget',    fontSize: 18, fontWeight: 400, color: '#6a6256', haloWidth: 2, haloColor: '#6a6256', haloOpacity: 0.2 } },
      { type: 'word-node', value: { x: 160, y: 150, text: 'spike',     fontSize: 20, fontWeight: 500, color: '#807060' } },
      { type: 'word-node', value: { x:  50, y:-110, text: 'shader',    fontSize: 16, fontWeight: 400, color: '#706a80', rotation: 15 } },
    ];

    oldNodes.forEach(n => group.subtree.push(SYS.makeNode(n.type, n.value)));
    this.sceneRoot = makeZoomableCamera(group, { centerOrigin: true });
  }
}
SYS.MODELS.push( new WordCloudModel() )
