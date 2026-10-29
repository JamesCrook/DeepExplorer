import { SYS } from '../omni-support/sys.js';
import { makeArray } from '../2d-support/make-array.js';
import { makeZoomableCamera } from '../2d-support/make-camera.js';
import { keyValue, NOTE_NAMES } from '../nodes2d/piano-key-zone.js';
export { PianoModel };

// Model 'Piano · 3 Octaves' — a keyboard of piano-keys that know their notes

class PianoModel {
  get name() { return 'Piano · 3 Octaves'; }
  get displayType() { return '2d'; }
  constructor() {
    this.visible = true;
    const PIANO = {startMidi:48,count:36};
    this.arrayNode = makeArray('piano-key', PIANO, {
      getValue: (mix, n, p, i) => {
        const k = keyValue(PIANO, i);
        return { 
          ...k, 
          tooltip: { 
            name: NOTE_NAMES[k.midi % 12] + (Math.floor(k.midi / 12) - 1),
            detail: 'MIDI ' + k.midi, 
            extra: k.black ? 'black' : 'white' 
          } 
        };
      },
    });
    this.sceneRoot = makeZoomableCamera(this.arrayNode);
    this.controls = [];
  }
}
SYS.MODELS.push(new PianoModel());
