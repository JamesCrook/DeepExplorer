/**
 * flash-card-node.js — `flash-card`: one card, value = [heading, body, body…].
 *
 * Leaf, mounted inside a card-grid (card-grid-node.js), which styles it.
 * Moved from apps/scenes-cards.js.
 */

import { SYS } from '../omni-support/sys.js';

// ═══════════════════════════════════════════════════════
//  NODE: card  (leaf — no subtree)
// ═══════════════════════════════════════════════════════
//
// Walk dispatches: mount, teardown
// value: ['Heading', 'Body item 1', 'Body item 2', …]

class CardNode {

  static mount(ctxMix, node, params) {
    const data  = node.value || [];
    const index = ctxMix.flyweight._cardIndex ?? 0;
    ctxMix.flyweight._cardIndex = index + 1;

    const card = document.createElement('div');
    card.className = 'ocard';

    // Card number
    const number = document.createElement('div');
    number.className = 'ocard-number';
    number.textContent = `#${index + 1}`;
    card.appendChild(number);

    // Heading (first item)
    const heading = document.createElement('div');
    heading.className = 'ocard-heading';
    heading.textContent = data[0] || '';
    card.appendChild(heading);

    // Divider
    const divider = document.createElement('div');
    divider.className = 'ocard-divider';
    card.appendChild(divider);

    // Body (remaining items)
    const body = document.createElement('div');
    body.className = 'ocard-body';
    for (let i = 1; i < data.length; i++) {
      if (!data[i]) continue;
      const item = document.createElement('div');
      item.className = 'ocard-body-item';
      item.textContent = data[i];
      if (i % 2 === 0) item.dataset.alternate = 'true';
      body.appendChild(item);
    }
    card.appendChild(body);

    ctxMix.parentEl.appendChild(card);
    node.inst = { el: card, heading, body, divider, number };
  }

  static teardown(ctxMix, node, params) {
    node.inst?.el?.remove();
    node.inst = null;
  }
}


// ── Register node classes ────────────────────────────────

SYS.NODE_CLASSES.push({ name: 'flash-card', cls: CardNode });

export { CardNode };
