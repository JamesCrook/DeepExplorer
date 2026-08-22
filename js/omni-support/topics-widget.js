/* ============================================
   topics-widget.js — Topic links for OmniControlPanel
   ============================================

   Registers the 'topics' and 'topic-link' types with sceneRegistry.

   The topics widget is a container; its children are topic-link nodes
   produced by coerceToAST. The walker handles iteration.

   topic-link registers navVersion: 'nav-item' so the nav coercion
   picks up each topic as a nav-item inside a nav-submenu.
*/

import { OmniWidget } from './omni-widget.js';
import { sceneRegistry } from './scene.js';

// ════════════════════════════════════════════════════════════════
//  Styles (injected once)
// ════════════════════════════════════════════════════════════════

const TOPIC_CSS = `
.omni-topics { display: flex; flex-direction: column; gap: 2px; }
.omni-topic {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 4px 8px; border: 1px solid transparent; border-radius: 4px;
  background: none; color: inherit; font: inherit; font-size: 13px;
  text-align: left; cursor: pointer;
}
.omni-topic:hover { background: rgba(127,127,127,0.14); }
.omni-topic.active {
  background: rgba(127,127,127,0.22); border-color: rgba(127,127,127,0.35);
}
.omni-topic:focus-visible { outline: 2px solid currentColor; outline-offset: 1px; }
.omni-topic-ico {
  width: 20px; height: 20px; flex: 0 0 auto; border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; font-family: 'SF Mono','Consolas',monospace;
  background: rgba(127,127,127,0.2);
}
.omni-topic-lbl {
  flex: 1; min-width: 0; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap;
}
.omni-topic-meta { flex: 0 0 auto; font-size: 10px; opacity: 0.6; }
`;

function ensureTopicStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('omni-topic-styles')) return;
  const el = document.createElement('style');
  el.id = 'omni-topic-styles';
  el.textContent = TOPIC_CSS;
  document.head.appendChild(el);
}


// ════════════════════════════════════════════════════════════════
//  TopicsWidget — container for topic-link children
// ════════════════════════════════════════════════════════════════

class TopicsWidget extends OmniWidget {

  static before_mount(ctxMix, node, params) {
    ensureTopicStyles();

    const list = document.createElement('div');
    list.className = 'omni-topics';

    ctxMix.parentStack.push(ctxMix.parentEl);
    ctxMix.parentEl = list;
  }

  static after_mount(ctxMix, node, params) {
    const list = ctxMix.parentEl;
    ctxMix.parentEl = ctxMix.parentStack.pop();
    ctxMix.parentEl.appendChild(list);
  }
}


// ════════════════════════════════════════════════════════════════
//  TopicLinkWidget — a single clickable topic (leaf)
// ════════════════════════════════════════════════════════════════

class TopicLinkWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};

    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'omni-topic';
    item.dataset.topicId = v.id || '';
    if (v.active) item.classList.add('active');

    const ico = document.createElement('span');
    ico.className = 'omni-topic-ico';
    ico.textContent = v.icon || '·';
    if (v.bg) ico.style.background = v.bg;
    if (v.fg) ico.style.color = v.fg;

    const lbl = document.createElement('span');
    lbl.className = 'omni-topic-lbl';
    lbl.textContent = v.label || v.id || '';

    item.append(ico, lbl);

    if (v.meta) {
      const meta = document.createElement('span');
      meta.className = 'omni-topic-meta';
      meta.textContent = v.meta;
      item.appendChild(meta);
    }

    item.addEventListener('click', () => {
      // Mark active within parent list
      const list = item.parentElement;
      if (list) {
        list.querySelectorAll('.omni-topic').forEach(el => el.classList.remove('active'));
      }
      item.classList.add('active');
      if (node.inst?.action) node.inst.action();
    });

    ctxMix.parentEl.appendChild(item);
  }
}


// ── Registration ─────────────────────────────────────────────
sceneRegistry.registerNodeClass('topics',     TopicsWidget,     { navVersion: 'nav-submenu', wrapInGroup: true, showInStrip: true });
sceneRegistry.registerNodeClass('topic-link', TopicLinkWidget,  { navVersion: 'nav-item', wrapInGroup: false, showInStrip: false });

export { TopicsWidget, TopicLinkWidget };
