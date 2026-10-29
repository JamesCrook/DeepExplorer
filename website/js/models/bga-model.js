import { SYS } from '../omni-support/sys.js';
import { ROW_LETTERS, pinLayout } from '../nodes2d/bga-zone.js';
import { makeArray } from '../2d-support/make-array.js';
import { makeZoomableCamera } from '../2d-support/make-camera.js';
export { BGAModel };

// Model 'BGA Package · 12×12' — a ball-grid-array chip's pins, signal and ground (bga-pin)

class BGAModel {
  get name() { return 'BGA Package · 12×12'; }
  get displayType() { return '2d'; }
  constructor() {
    this.visible = true;
    const rows=12,cols=12;
    const pins=[];
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const cr=Math.max(Math.abs(r),Math.abs(r-rows+1))
        const cc=Math.max(Math.abs(c),Math.abs(c-cols+1));
        if(cr+cc<=1){
          pins.push(null);
          continue;
        }
        if(r===0||r===rows-1||c===0||c===cols-1)
          pins.push({
            type:(r+c)%2===0?'power':'ground',
            net:(r+c)%2===0?'VCC':'GND'});
        else if(r===1||r===rows-2||c===1||c===cols-2)
          pins.push({
            type:'ground',
            net:'GND'});
        else 
          pins.push({
            type:'signal',
            net:'IO_'+(r*cols+c)});
        }}
    const BGA = {rows,cols,pins};
    this.arrayNode = makeArray('bga-pin', BGA, {
      getValue: (mix, n, p, i) => {
        const row = Math.floor(i / cols), col = i % cols;
        const pin = pins[i], name = (ROW_LETTERS[row] || '?') + (col + 1);
        const { W, H } = mix.getWH(mix, n, p);
        const g = pinLayout(W, H, BGA, { row, col });
        return { row, col, pin, name, 
          cx: g.cx, 
          cy: g.cy, 
          r: g.r,
          tooltip: { name, 
            detail: pin ? (pin.net || pin.type) : 'no connect',
            extra: pin ? pin.type : '' } 
        };
      },
    });
    this.sceneRoot = makeZoomableCamera(this.arrayNode);
    this.controls = [];
  }
}
SYS.MODELS.push(new BGAModel());
