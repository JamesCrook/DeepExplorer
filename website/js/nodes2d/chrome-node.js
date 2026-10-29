import { SYS, sceneRegistry } from '../omni-support/sys.js';
export { ChromeNode };

/*
`chrome-node` — what a family draws behind or in front of its items, as an ordinary sibling

Whatever a family draws behind or in front of its items.  It is an ordinary
   sibling node, so the model decides whether there is one at all:
     subtree = [ background, flyweightArray, overlay ]
   Its value carries the shared data; inst says which leaf method to run. */
class ChromeNode {
  static draw2d(ctxMix, node, params) {
    node.inst?.drawFn?.(ctxMix, node, params);
  }
}

SYS.NODE_CLASSES.push({ name: 'chrome-node', cls: ChromeNode });;
