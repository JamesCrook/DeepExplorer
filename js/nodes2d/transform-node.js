
import { sceneRegistry } from '../omni-support/scene.js';

class TransformNode {

  static before_measure(ctxMix, node, params) {
  }

  static after_measure(ctxMix, node, params) {
  }

  // ── Phase methods: draw2d ──────────────────────────────────
  static before_draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    let v = node.value

    ctx.save();
    //ctx.translate(v.x, v.y);
    ctx.scale(params.zoom, params.zoom);
    //ctx.translate(-v.x, -v.y);
  }

  static after_draw2d(ctxMix, node, params) {
    ctxMix.ctx.restore();
  }

  // ── Phase methods: hitTest ─────────────────────────────────

  static before_hitTest(ctxMix, node, params) {
  }

  static after_hitTest(ctxMix, node, params) {
  }

}

sceneRegistry.registerNodeClass('transform', TransformNode);

