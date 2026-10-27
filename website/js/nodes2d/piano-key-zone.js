import { SYS, sceneRegistry } from '../omni-support/sys.js';
import { HIGHLIGHT, rrPath } from '../2d-support/paint.js';
export { PianoKeyNode, keyValue, NOTE_NAMES };

const BLACK_SET=new Set([1,3,6,8,10]), NOTE_NAMES=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
function noteOfIndex(data,idx){const midi=data.startMidi+idx;return{midi,black:BLACK_SET.has(midi%12)};}
/* A key knows its own note and where it sits among the whites; the keyboard
   as a whole supplies only the pane it is drawn in. */
function keyLayout(W,H,v){
  const margin=20, kbW=W-margin*2, kbH=H-margin*2;
  const wW=kbW/v.totalWhites, bW=wW*0.58, bH=kbH*0.6, topY=margin, leftX=margin;
  if(!v.black) return{black:v.black,midi:v.midi,x:leftX+v.whitesBefore*wW,y:topY,w:wW,h:kbH};
  return{black:v.black,midi:v.midi,x:leftX+v.whitesBefore*wW-bW/2,y:topY,w:bW,h:bH};
}

// The model's view of a key: everything one key needs, and no index.
function keyValue(data,idx){
  const midi=data.startMidi+idx, black=BLACK_SET.has(midi%12);
  let totalWhites=0, whitesBefore=0;
  for(let i=0;i<data.count;i++){
    if(BLACK_SET.has((data.startMidi+i)%12)) continue;
    totalWhites++;
    if(i<idx) whitesBefore++;
  }
  return {midi,black,whitesBefore,totalWhites};
}

class PianoKeyNode {
  static getCount(data) {
    return data.count;
  }

  // Whites first, then blacks over them: a draw order, not a pass counter.
  static _split(data, count) {
    const b = [];
    const w = [];
    
    for (let i = 0; i < count; i++) {
      if (BLACK_SET.has((data.startMidi + i) % 12)) {
        b.push(i);
      } else {
        w.push(i);
      }
    }
    
    return { b, w };
  }

  static getDrawOrder(data, count) {
    const { b, w } = PianoKeyNode._split(data, count);
    return w.concat(b);
  }

  static getHitOrder(data, count) {
    const { b, w } = PianoKeyNode._split(data, count);
    return b.concat(w);
  }

  static draw2d(ctxMix, node, params) {
    const v = ctxMix.getValue(ctxMix, node, params);
    const ctx = ctxMix.ctx;
    const { W, H } = ctxMix.getWH(ctxMix, node, params);
    const lay = keyLayout(W, H, v);

    const decodeColor = [ '#1a1a18','#3a3830','#F0EDE4','#D8D0C0', HIGHLIGHT]
    const cIndex = v.selected ? 4 : ((lay.black ? 0:2) + (v.hovered ? 1 : 0));
    ctx.fillStyle = decodeColor[ cIndex ];

    if (lay.black) {
      rrPath(ctx, lay.x, lay.y, lay.w, lay.h, 0, 0, 3, 3);
      ctx.fill();
      ctx.fillStyle = v.selected ? '#E8B840' : '#2a2a28';
      ctx.fillRect(lay.x + 1, lay.y, lay.w - 2, lay.h * 0.04);
    } else {
      rrPath(ctx, lay.x + 0.5, lay.y, lay.w - 1, lay.h, 0, 0, 3, 3);
      ctx.fill();
      
      ctx.strokeStyle = '#B0A890';
      ctx.lineWidth = 0.5;
      rrPath(ctx, lay.x + 0.5, lay.y, lay.w - 1, lay.h, 0, 0, 3, 3);
      ctx.stroke();

      if (NOTE_NAMES[lay.midi % 12] === 'C') {
        const oct = Math.floor(lay.midi / 12) - 1;
        
        ctx.fillStyle = '#908878';
        ctx.font = '500 10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('C' + oct, lay.x + lay.w / 2, lay.y + lay.h - 6);
      }
    }
  }

  static hit_test(ctxMix, node, params) {
    const v = ctxMix.getValue(ctxMix, node, params);
    const pt = ctxMix.hitPoint;
    
    if (!pt) return;
    
    const { W, H } = ctxMix.getWH(ctxMix, node, params);
    const lay = keyLayout(W, H, v);
    
    if (
      pt.x >= lay.x &&
      pt.x <= lay.x + lay.w &&
      pt.y >= lay.y &&
      pt.y <= lay.y + lay.h
    ) {
      ctxMix.hitResult = { node };
    }
  }
}
SYS.NODE_CLASSES.push({ name: 'piano-key', cls: PianoKeyNode });;
