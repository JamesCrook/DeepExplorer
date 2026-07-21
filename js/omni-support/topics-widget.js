/* ============================================
   topics-widget.js — Topic links for OmniControlPanel
   ============================================

   Registers the 'topics' section type with WidgetFactory. Import this 
   file for its side effect:

     import './topics-widget.js';

   The topics widget is a container of decorative clickable text.

   Config:

     { type: 'topics', group: 'Explore', id: 'explore', abbrev: 'Exp',
       topics: [
         { id: 'bmesh', label: 'BMesh', icon: 'B', meta: '58%',
           bg: '#3d4a6a', fg: '#8eaad8', active: true, href: '#bmesh' },
         { id: 'mesh',  label: 'Mesh',  icon: 'M' },
       ],
       onSelect: (topic, panel) => { ... },   // optional
     }

   Every field is plain JSON, so a topics section can travel inside a
   markdown code island and be compiled by
   OmniControlPanel.setContextFromSpec().

   The widget does not decide what a topic link means. It marks the
   selection and reports it; the host routes it (swap the slider set,
   scroll a card, send a prompt).

   Place in: omni-support/topics-widget.js  (beside layers-widget.js, which
   omni-control-panel.js imports as './layers-widget.js')
*/

import { OmniWidget, createWidget, parseDslValue, _esc }
                             from './omni-widget.js';
import { sceneRegistry }     from './scene.js';

// ════════════════════════════════════════════════════════════════
//  Styles
// ════════════════════════════════════════════════════════════════
//
//  Injected once, on first use. Deliberately theme-neutral —
//  translucent greys inherit whatever palette the host uses, and the
//  omni-topic* names cannot collide with existing omni-controls.css
//  rules. Move into omni-controls.css whenever convenient; nothing
//  else depends on this block.

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
//  TopicsWidget
// ════════════════════════════════════════════════════════════════

class TopicsWidget extends OmniWidget {

  // Defaults inherited: wrapInGroup = true (gives the .control-group +
  // h3 header), showInStrip = true (gives a multiscroller tab).

  mount(ctxMix, node, params) {
    if (ctxMix.compact) {
      const topics = node.topics || [];
      if (!topics.length) return null;
      const cfg = {
        type: 'nav-submenu', label: node.group || 'Topics',
        subtree: topics.map(topic => ({
          type: 'nav-item', label: topic.label || topic.id || 'Topic',
          action: () => {
            const item = document.querySelector(
              `.omni-topic[data-topic-id="${CSS.escape(topic.id || '')}"]`
            );
            if (item) TopicsWidget._markActive(item.parentElement, item);
            if (node.onSelect) node.onSelect(topic, ctxMix.panel);
          },
        })),
      };
      return WidgetFactory.create(cfg).mount(ctxMix, cfg, params);
    }

    ensureTopicStyles();

    const list = document.createElement('div');
    list.className = 'omni-topics';

    for (const topic of (node.topics || [])) {
      list.appendChild(this._buildItem(topic, list, node, ctxMix));
    }

    return list;
  }

  _buildItem(topic, list, node, ctxMix) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'omni-topic';
    item.dataset.topicId = topic.id || '';
    if (topic.active) item.classList.add('active');

    const ico = document.createElement('span');
    ico.className = 'omni-topic-ico';
    ico.textContent = topic.icon || '·';
    if (topic.bg) ico.style.background = topic.bg;
    if (topic.fg) ico.style.color = topic.fg;

    const lbl = document.createElement('span');
    lbl.className = 'omni-topic-lbl';
    lbl.textContent = topic.label || topic.id || '';

    item.append(ico, lbl);

    if (topic.meta) {
      const meta = document.createElement('span');
      meta.className = 'omni-topic-meta';
      meta.textContent = topic.meta;
      item.appendChild(meta);
    }

    item.addEventListener('click', () => {
      TopicsWidget._markActive(list, item);
      if (node.onSelect) node.onSelect(topic, ctxMix.panel);
    });

    return item;
  }

  static _markActive(list, item) {
    if (!list) return;
    list.querySelectorAll('.omni-topic').forEach(el => el.classList.remove('active'));
    item.classList.add('active');
  }
}


// ── Self-register (same pattern as layers-widget.js) ─────────────
sceneRegistry.registerNodeClass('topics', TopicsWidget);

export { TopicsWidget };
