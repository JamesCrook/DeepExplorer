import { SYS, sceneRegistry } from '../omni-support/sys.js';
export { CameraNode };

// `camera-node` — the Zones camera: applies a Camera's transform and draws a background grid (container)

class CameraNode {
  static before_draw2d(ctxMix, node, params) {
    const c = ctxMix.ctx;
    const cam = node.value.cam;
    cam.apply(c);

    const spacing = 40, l = cam.ox, t = cam.oy;
    const W = ctxMix.getWH().W;
    const H = ctxMix.getWH().H;
    const r = l + W / cam.z, b = t + H / cam.z;

    c.fillStyle = '#1c1c38'; 
    const ds = 1 / cam.z;
    for (let x = Math.floor(l / spacing) * spacing; x <= r; x += spacing)
      for (let y = Math.floor(t / spacing) * spacing; y <= b; y += spacing)
        c.fillRect(x, y, ds, ds);
  }

  static after_draw2d(ctxMix, node, params) {
    node.value.cam.reset(ctxMix.ctx);
  }

  static before_hit_test(ctxMix, node, params) {
    node.value.savedHit = ctxMix.hitPoint;
    if (ctxMix.hitPoint) {
      ctxMix.hitPoint = node.value.cam.toWorld(ctxMix.hitPoint.x, ctxMix.hitPoint.y);
    }
  }

  static after_hit_test(ctxMix, node, params) {
    ctxMix.hitPoint = node.value.savedHit;
  }
}

SYS.NODE_CLASSES.push({ name: 'camera-node', cls: CameraNode });;
