/**
 * `card-grid` — a flex grid of styled HTML cards
 *
 * Container (mount / update / teardown vocabulary, so it mounts in OmniHtml
 * or DemoHarnessHtml).  Injects STATIC_CSS once, and on every update rewrites
 * a <style> from params (generateDynamicCSS), so the card look is all params.
 * Its children are flash-card nodes (flash-card-node.js).
 *
 * Moved from apps/scenes-cards.js, which keeps the scene, presets and panel.
 */

import { SYS } from '../omni-support/sys.js';

// ═══════════════════════════════════════════════════════
//  CSS HELPERS
// ═══════════════════════════════════════════════════════

function hsl(h, s, l, a = 1) {
  return a < 1
    ? `hsla(${h}, ${s}%, ${l}%, ${a})`
    : `hsl(${h}, ${s}%, ${l}%)`;
}

function alignment(v) {
  if (v <= 0.33) return 'flex-start';
  if (v <= 0.67) return 'center';
  return 'flex-end';
}

function textAlign(v) {
  if (v <= 0.33) return 'left';
  if (v <= 0.67) return 'center';
  return 'right';
}


// ═══════════════════════════════════════════════════════
//  STATIC CSS  (injected once in mount, removed in teardown)
// ═══════════════════════════════════════════════════════

const STATIC_CSS = `
/* ── Card grid container ─────────────────────────── */
.ocard-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 20px;
  justify-content: center;
  align-content: flex-start;
  width: 100%;
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
}

/* ── Base card structure (non-parametric) ─────────── */
.ocard {
  display: flex;
  flex-direction: column;
  position: relative;
  transition: transform 0.2s;
  overflow: hidden;
  box-sizing: border-box;
}
.ocard:hover { transform: translateY(-2px); }

.ocard-number {
  position: absolute;
  top: 8px;
  right: 12px;
  font-size: 10px;
  color: #555;
  font-family: monospace;
}
.ocard-body {
  flex: 1;
  overflow-y: auto;
}
.ocard-body-item:last-child {
  margin-bottom: 0;
}
`;


// ═══════════════════════════════════════════════════════
//  DYNAMIC CSS  (regenerated on every param update)
// ═══════════════════════════════════════════════════════

function generateDynamicCSS(p) {
  // Accumulate filter properties
  const filters = [];
  if (p.saturation !== 1) filters.push(`saturate(${p.saturation})`);
  if (p.brightness !== 1) filters.push(`brightness(${p.brightness})`);

  return `
.ocard {
  width: ${p.cardWidth}px;
  height: ${p.cardHeight}px;
  padding: ${p.padding}px;
  justify-content: ${alignment(p.alignV)};
  align-items: ${alignment(p.alignH)};
  text-align: ${textAlign(p.alignH)};
  background-color: ${hsl(p.bgHue, p.bgSat, p.bgLight, p.bgOpacity)};
  border-radius: ${p.borderRadius}px;
  ${p.borderWidth > 0
    ? `border: ${p.borderWidth}px solid ${hsl(p.borderHue, 50, 50, p.borderOpacity)};`
    : ''}
  ${(p.shadowBlur > 0 || p.shadowX !== 0 || p.shadowY !== 0)
    ? `box-shadow: ${p.shadowX}px ${p.shadowY}px ${p.shadowBlur}px rgba(0,0,0,${p.shadowOpacity});`
    : ''}
  ${p.backdropBlur > 0
    ? `backdrop-filter: blur(${p.backdropBlur}px); -webkit-backdrop-filter: blur(${p.backdropBlur}px);`
    : ''}
  ${filters.length ? `filter: ${filters.join(' ')};` : ''}
}

.ocard-heading {
  font-size: ${p.headingSize}px;
  font-weight: ${p.headingWeight};
  letter-spacing: ${p.headingSpacing}px;
  line-height: ${p.headingLineHeight};
  color: ${hsl(p.headingHue, p.headingSat, p.headingLight)};
  opacity: ${p.headingOpacity};
  margin-bottom: ${p.contentGap}px;
}

.ocard-divider {
  height: ${p.dividerHeight}px;
  width: ${p.dividerWidth}%;
  background: ${hsl(p.dividerHue, p.dividerSat, p.dividerLight, p.dividerOpacity)};
  margin-top: ${p.dividerTopMargin}px;
  margin-bottom: ${p.contentGap}px;
}

.ocard-body-item {
  font-size: ${p.bodySize}px;
  font-weight: ${p.bodyWeight};
  letter-spacing: ${p.bodySpacing}px;
  line-height: ${p.bodyLineHeight};
  color: ${hsl(p.bodyHue, p.bodySat, p.bodyLight)};
  opacity: ${p.bodyOpacity};
  margin-bottom: 8px;
}

.ocard-body-item[data-alternate="true"] {
  opacity: ${p.bodyOpacity * 0.85};
  font-weight: ${Math.max(100, p.bodyWeight - 100)};
}
`;
}


// ═══════════════════════════════════════════════════════
//  NODE: card-grid  (container — has subtree)
// ═══════════════════════════════════════════════════════
//
// Walk dispatches: before_mount / after_mount
//                  before_update
//                  after_teardown

class CardGridNode {

  // ── Mount ────────────────────────────────────────────

  static before_mount(ctxMix, node, params) {
    const el = document.createElement('div');
    el.className = 'ocard-grid';

    // Inject static (structural) styles
    const staticStyle = document.createElement('style');
    staticStyle.textContent = STATIC_CSS;
    document.head.appendChild(staticStyle);

    // Placeholder for dynamic (param-driven) styles
    const dynamicStyle = document.createElement('style');
    document.head.appendChild(dynamicStyle);

    ctxMix.parentEl.appendChild(el);

    node.inst = { el, staticStyle, dynamicStyle };

    // Push parent so card children append into the grid
    ctxMix.parentStack.push(ctxMix.parentEl);
    ctxMix.parentEl = el;
  }

  static after_mount(ctxMix, node, params) {
    ctxMix.parentEl = ctxMix.parentStack.pop();
  }

  // ── Update ───────────────────────────────────────────

  static before_update(ctxMix, node, params) {
    if (node.inst?.dynamicStyle) {
      node.inst.dynamicStyle.textContent = generateDynamicCSS(params);
    }
  }

  // ── Teardown ─────────────────────────────────────────

  static after_teardown(ctxMix, node, params) {
    if (!node.inst) return;
    node.inst.staticStyle?.remove();
    node.inst.dynamicStyle?.remove();
    node.inst.el?.remove();
    node.inst = null;
  }
}


SYS.NODE_CLASSES.push({ name: 'card-grid', cls: CardGridNode });

export { CardGridNode, generateDynamicCSS };
