import { SYS } from '../../omni-support/sys.js';
import { OmniWidget } from './widget-base.js';
export { FileDropWidget };

// ════════════════════════════════════════════════════════════════
//  FileDropWidget (leaf)
// ════════════════════════════════════════════════════════════════

class FileDropWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const drop = document.createElement('div');
    drop.className = 'file-drop';
    drop.id = v.id || '';
    drop.innerHTML = `
      <div class="file-drop-icon">📁</div>
      <div>${v.label || 'Drop files here'}</div>
    `;

    drop.addEventListener('dragover', (e) => {
      e.preventDefault();
      drop.classList.add('dragover');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('dragover');
      if (node.inst?.onDrop) node.inst.onDrop(e.dataTransfer.files, ctxMix.panel);
    });
    drop.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = v.multiple || false;
      input.accept = v.accept || '*';
      input.onchange = () => {
        if (node.inst?.onDrop) node.inst.onDrop(input.files, ctxMix.panel);
      };
      input.click();
    });

    ctxMix.parentEl.appendChild(drop);
  }
}

SYS.NODE_CLASSES.push({ name: 'filedrop', cls: FileDropWidget });
