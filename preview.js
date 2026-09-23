import { addons } from '@storybook/preview-api';
import { TOKENS_HIGHLIGHT_EVENT, TOKENS_HIGHLIGHT_COLOR, DEFAULT_CONFIG } from './constants.js';

const OUTLINE_CLASS = 'tokens-addon-highlight';
const RADIUS_CLASS = 'tokens-addon-highlight-radius';
const STYLE_ID = 'tokens-addon-highlight-style';
const OVERLAY_ID = 'tokens-addon-dimension-overlay';

// Cleanup functions for whatever the current hover applied — run before every new
// highlight and on clear, so nothing from a previous hover (or a previous story) lingers.
let cleanupFns = [];

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .${OUTLINE_CLASS} {
      outline: 2px solid ${TOKENS_HIGHLIGHT_COLOR} !important;
      outline-offset: 2px !important;
      transition: outline-color 120ms ease;
    }
    .${RADIUS_CLASS} {
      /* Flush to the edge (no offset) so this traces the rendered corner curve itself —
         an inset offset reads as "there is padding/space here", which is a different
         token's job. Radius is only ever about the corners, never about spacing. */
      outline: 3px solid ${TOKENS_HIGHLIGHT_COLOR} !important;
      outline-offset: 0 !important;
      transition: outline-color 120ms ease;
    }
  `;
  document.head.appendChild(style);
}

function clearAll() {
  cleanupFns.forEach(fn => {
    try { fn(); } catch { /* target may have unmounted with the story */ }
  });
  cleanupFns = [];
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) overlay.remove();
}

function findTargets(part, variant, config) {
  const root = document.getElementById('storybook-root') || document.body;
  const scoped = variant ? root.querySelectorAll(`[${config.dataAttribute}="${part}"][${config.variantAttribute}="${variant}"]`) : [];
  const list = scoped.length ? scoped : root.querySelectorAll(`[${config.dataAttribute}="${part}"]`);
  return Array.from(list);
}

// Typography rows point at a component's root part (e.g. "button"), but the text actually
// lives on a more specific descendant ("button-label"). Narrow to it via the same -label/
// -description/-error/... suffix convention every component's DOM already follows.
function refineTypographyTarget(root, item, config) {
  const text = `${item.label ?? ''} ${item.meta ?? ''}`.toLowerCase();
  const suffixes = ['label', 'description', 'error', 'placeholder', 'value', 'counter'];
  for (const suffix of suffixes) {
    if (text.includes(suffix)) {
      const el = root.querySelector(`[${config.dataAttribute}$="-${suffix}"]`);
      if (el) return el;
    }
  }
  return root;
}

function overrideInlineStyle(el, property, value, important) {
  const prevValue = el.style.getPropertyValue(property);
  const prevPriority = el.style.getPropertyPriority(property);
  el.style.setProperty(property, value, important ? 'important' : '');
  cleanupFns.push(() => {
    if (prevValue) el.style.setProperty(property, prevValue, prevPriority);
    else el.style.removeProperty(property);
  });
}

  // The injected highlight classes (ensureStyle, below) are static CSS
// authored once at module load using the DEFAULT highlight color — they can't read a
// per-hover `config.highlightColor` override directly. When a payload configures a
// different color, this nudges it in via an inline !important outline-color instead of
// forking the stylesheet per call.
function addClass(el, className, color) {
  el.classList.add(className);
  const customColor = color && color !== TOKENS_HIGHLIGHT_COLOR;
  if (customColor) el.style.setProperty('outline-color', color, 'important');
  cleanupFns.push(() => {
    el.classList.remove(className);
    if (customColor) el.style.removeProperty('outline-color');
  });
}

function resolvePx(token, value) {
  if (token && typeof window !== 'undefined') {
    const resolved = window.getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    if (resolved) return resolved;
  }
  return value ?? '';
}

// A flex child stretches to fill its parent's CROSS axis by default (align-items: stretch)
// regardless of its own display type — a row (e.g. a switch's track+label row) inside a
// flex-column parent still gets stretched to the full container WIDTH, with its real
// content packed at the start and the rest just empty box; reading that child's own
// getBoundingClientRect() would report the fake, stretched extent. Only the CROSS axis is
// ever inflated this way — the axis actually being measured (top/bottom for a vertical
// gap, left/right for a horizontal one) is unaffected and stays accurate on the element's
// own rect. So this only tightens the cross-axis bound, via the union of the element's own
// children (ignoring its own possibly-stretched outer box) or, for a leaf with direct text
// (e.g. a <span> description), the rendered text's own Range rect — and leaves the measured
// axis alone. (Recursing into children for BOTH axes would be wrong the other way: a
// switch-track button's own box is its real visual pill shape — recursing into its single
// child, the small thumb circle, would wrongly shrink it down to just the thumb.)
function tightContentRect(el, axis) {
  const plain = el.getBoundingClientRect();
  let crossMin, crossMax;

  if (el.children.length > 0) {
    const rects = Array.from(el.children).map(c => c.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0);
    if (rects.length) {
      crossMin = axis === 'vertical' ? Math.min(...rects.map(r => r.left)) : Math.min(...rects.map(r => r.top));
      crossMax = axis === 'vertical' ? Math.max(...rects.map(r => r.right)) : Math.max(...rects.map(r => r.bottom));
    }
  }
  if (crossMin === undefined) {
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      if (r.width > 0 || r.height > 0) {
        crossMin = axis === 'vertical' ? r.left : r.top;
        crossMax = axis === 'vertical' ? r.right : r.bottom;
      }
    } catch { /* non-text leaf (e.g. an <svg> icon) — fall through to its own box below */ }
  }
  if (crossMin === undefined) {
    crossMin = axis === 'vertical' ? plain.left : plain.top;
    crossMax = axis === 'vertical' ? plain.right : plain.bottom;
  }

  return axis === 'vertical'
    ? { left: crossMin, right: crossMax, top: plain.top, bottom: plain.bottom, width: crossMax - crossMin, height: plain.height }
    : { left: plain.left, right: plain.right, top: crossMin, bottom: crossMax, width: plain.width, height: crossMax - crossMin };
}

// A "gap.*" row measures the space BETWEEN two specific children, not the container's own
// edge (that's what "padding.*" rows are for). Finds the pair of laid-out children the gap
// actually sits between, so the dimension line can be drawn exactly there — not floating at
// the container's corner, which is only ever right by coincidence.
function findGapChildren(container, axis) {
  const children = Array.from(container.children).filter(child => {
    const style = window.getComputedStyle(child);
    if (style.position === 'absolute' || style.position === 'fixed') return false;
    if (style.display === 'none') return false;
    const rect = child.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
  if (children.length !== 2) return null;
  const rects = children.map(c => tightContentRect(c, axis));
  // Order along the measured axis so "from" is always the earlier element.
  rects.sort((a, b) => axis === 'vertical' ? a.top - b.top : a.left - b.left);
  return rects;
}

function getPaddingSides(item) {
  if (Array.isArray(item?.paddingSides) && item.paddingSides.length) return item.paddingSides;
  if (typeof item?.padding === 'string') {
    const sides = item.padding.split(/[-,\s]+/).filter(Boolean).map(side => side === 'start' ? 'left' : side === 'end' ? 'right' : side);
    if (sides.includes('all')) return ['top', 'right', 'bottom', 'left'];
    return sides.filter(side => ['top', 'right', 'bottom', 'left'].includes(side));
  }
  return [];
}

function drawPaddingOverlay(el, px, sides, color) {
  const rect = el.getBoundingClientRect();
  const amount = Math.max(parseFloat(px) || 0, 0);
  if (!amount || !sides.length) return false;
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
  const fill = `${color}42`;
  const edge = `${color}b3`;
  const zones = [];
  if (sides.includes('top')) zones.push(`left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${Math.min(amount, rect.height)}px;`);
  if (sides.includes('right')) zones.push(`left:${Math.max(rect.right - amount, rect.left)}px;top:${rect.top}px;width:${Math.min(amount, rect.width)}px;height:${rect.height}px;`);
  if (sides.includes('bottom')) zones.push(`left:${rect.left}px;top:${Math.max(rect.bottom - amount, rect.top)}px;width:${rect.width}px;height:${Math.min(amount, rect.height)}px;`);
  if (sides.includes('left')) zones.push(`left:${rect.left}px;top:${rect.top}px;width:${Math.min(amount, rect.width)}px;height:${rect.height}px;`);
  overlay.innerHTML = zones.map(style => `<div style="position:fixed;${style}background:${fill};box-sizing:border-box;border:2px solid ${edge};"></div>`).join('');
  document.body.appendChild(overlay);
  return true;
}

function drawDimensionLine(el, px, axis, category, isGap, color, paddingSides = []) {
  const rect = el.getBoundingClientRect();
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.zIndex = '2147483647';
  overlay.style.pointerEvents = 'none';

  const line = (style) => `position:fixed; background:${color}; ${style}`;
  const label = (left, top) => `
    position:fixed; left:${left}px; top:${top}px; transform:translateX(-50%);
    padding:2px 6px; font:600 11px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    color:#fff; background:${color}; border-radius:4px; white-space:nowrap;
  `;
  // Spells out the axis on the pill itself ("8px · H" / "32px · V") — the line's own
  // orientation already shows it visually, but the letter makes it unambiguous at a
  // glance which axis a given spacing/sizing value was actually measured on.
  const axisLetter = axis === 'vertical' ? 'V' : 'H';
  const text = `${px} · ${axisLetter}`;
  // `sizing` measures the component's OWN rendered dimension along this axis (its real
  // height, or — the rare width-typed exception, e.g. Switch's track width — its real
  // width); `spacing` measures a gap/inset, so the line's length is the token's own
  // resolved px value instead, never the component's size.
  const isSizing = category === 'sizing';

  if (category === 'spacing' && paddingSides.length && drawPaddingOverlay(el, px, paddingSides, color)) return;

  // A "gap.*" row measures the space between two SPECIFIC children (e.g. a switch track
  // and its label) — draw the line exactly in that space, not at the outer container's
  // corner, which is only right by coincidence and otherwise reads as floating/disconnected.
  if (isGap && !isSizing) {
    const children = findGapChildren(el, axis);
    if (children) {
      const [from, to] = children;
      if (axis === 'vertical') {
        // A flex-column child with no explicit width can stretch to fill the container
        // (align-items: stretch is the default cross-axis behavior) — its rect can be far
        // wider than its visible content. Center on the two rects' horizontal OVERLAP
        // (where both elements actually occupy space) instead of their outer union, so a
        // stretched child doesn't drag the line off toward empty space. Falls back to the
        // narrower rect's own left edge if they don't overlap at all.
        const overlapLeft = Math.max(from.left, to.left);
        const overlapRight = Math.min(from.right, to.right);
        const centerX = overlapRight > overlapLeft
          ? (overlapLeft + overlapRight) / 2
          : Math.min(from.left, to.left) + Math.min(from.width, to.width) / 2;
        const top = from.bottom;
        const bottom = to.top;
        overlay.innerHTML = `
          <div style="${line(`left:${centerX - 1}px; top:${top}px; width:2px; height:${Math.max(bottom - top, 0)}px;`)}"></div>
          <div style="${line(`left:${centerX - 5}px; top:${top}px; width:10px; height:2px;`)}"></div>
          <div style="${line(`left:${centerX - 5}px; top:${bottom - 2}px; width:10px; height:2px;`)}"></div>
          <div style="${label(centerX + 30, (top + bottom) / 2 - 9)}">${text}</div>
        `;
        document.body.appendChild(overlay);
        return;
      }
      // Same overlap-first logic as the vertical branch — a row child stretched by
      // align-items: stretch on the cross (vertical) axis shouldn't drag centerY toward
      // its own oversized height.
      const overlapTop = Math.max(from.top, to.top);
      const overlapBottom = Math.min(from.bottom, to.bottom);
      const centerY = overlapBottom > overlapTop
        ? (overlapTop + overlapBottom) / 2
        : Math.min(from.top, to.top) + Math.min(from.height, to.height) / 2;
      const left = from.right;
      const right = to.left;
      overlay.innerHTML = `
        <div style="${line(`left:${left}px; top:${centerY - 1}px; width:${Math.max(right - left, 0)}px; height:2px;`)}"></div>
        <div style="${line(`left:${left}px; top:${centerY - 5}px; width:2px; height:10px;`)}"></div>
        <div style="${line(`left:${right - 2}px; top:${centerY - 5}px; width:2px; height:10px;`)}"></div>
        <div style="${label((left + right) / 2, centerY - 28)}">${text}</div>
      `;
      document.body.appendChild(overlay);
      return;
    }
    // Fall through to the generic container-relative line below when the container
    // doesn't have exactly two laid-out children (e.g. an icon-only or single-child gap).
  }

  if (axis === 'vertical') {
    // Prefer the outside-right edge; fall back to outside-left, then to hugging the
    // element's own right edge (inside) if there's no room on either side.
    let left = rect.right + 14;
    if (left + 44 > window.innerWidth) left = rect.left - 44;
    let inside = false;
    if (left < 0) { left = rect.right - 14; inside = true; }
    const top = rect.top;
    const height = isSizing ? rect.height : (parseFloat(px) || 0);
    overlay.innerHTML = `
      <div style="${line(`left:${left}px; top:${top}px; width:2px; height:${height}px;`)}"></div>
      <div style="${line(`left:${left - 4}px; top:${top}px; width:10px; height:2px;`)}"></div>
      <div style="${line(`left:${left - 4}px; top:${top + height - 2}px; width:10px; height:2px;`)}"></div>
      <div style="${label(left + (inside ? -18 : 18), top + height / 2 - 9)}">${text}</div>
    `;
  } else {
    // Prefer outside-bottom; fall back to outside-top, then hugging the element's own
    // bottom edge (inside) if the viewport leaves no room either way.
    let top = rect.bottom + 14;
    if (top + 34 > window.innerHeight) top = rect.top - 34;
    let inside = false;
    if (top < 0) { top = rect.bottom - 20; inside = true; }
    const left = rect.left;
    const width = isSizing ? rect.width : (parseFloat(px) || 0);
    overlay.innerHTML = `
      <div style="${line(`left:${left}px; top:${top}px; width:${width}px; height:2px;`)}"></div>
      <div style="${line(`left:${left}px; top:${top - 4}px; width:2px; height:10px;`)}"></div>
      <div style="${line(`left:${left + width - 2}px; top:${top - 4}px; width:2px; height:10px;`)}"></div>
      <div style="${label(left + width / 2, top + (inside ? -18 : 8))}">${text}</div>
    `;
  }

  document.body.appendChild(overlay);
}

function getAxis(item) {
  // Sizing defaults to vertical — the component's own height is what "sizing" means in
  // the overwhelming majority of cases (field/control height, a square control's own
  // box). The one legitimate exception is a genuinely width-typed sizing token (e.g.
  // Switch's track width) — its .doc.ts row tags `axis: 'horizontal'` explicitly; never
  // guessed from the label.
  if (item.category === 'sizing') return item.axis === 'horizontal' ? 'horizontal' : 'vertical';
  // Spacing is a gap BETWEEN elements, and can run either way — trust the row's own
  // `axis` (set from the real flex-direction/layout in its .doc.ts) over any guess.
  if (item.axis === 'vertical' || item.axis === 'horizontal') return item.axis;
  return 'horizontal';
}

function applyHighlight(payload) {
  clearAll();
  const { part, variant, category, token, value, label } = payload;
  if (!part) return;
  // Merge over DEFAULT_CONFIG (not just the payload) so a partial `tokensAddon`
  // override (e.g. only `highlightColor` set) still gets the default dataAttribute/etc.
  const config = { ...DEFAULT_CONFIG, ...(payload.config ?? {}) };
  const targets = findTargets(part, variant, config);
  if (!targets.length) return;

  if (category === 'color') {
    targets.forEach(el => {
      if (token) overrideInlineStyle(el, token, config.highlightColor, false);
      else addClass(el, OUTLINE_CLASS, config.highlightColor);
    });
    return;
  }

  if (category === 'typography') {
    targets.forEach(el => {
      const target = refineTypographyTarget(el, payload, config);
      overrideInlineStyle(target, 'color', config.highlightColor, true);
    });
    return;
  }

  if (category === 'radius') {
    targets.forEach(el => addClass(el, RADIUS_CLASS, config.highlightColor));
    return;
  }

  if (category === 'shadows') {
    targets.forEach(el => {
      overrideInlineStyle(el, 'box-shadow', `0 8px 24px ${config.highlightColorSoft}, 0 2px 8px ${config.highlightColor}8c`, true);
    });
    return;
  }

  if (category === 'spacing' || category === 'sizing') {
    // No outline here — an outline reads as a border-color highlight, which is a
    // different token's job. The dimension line alone is the spacing/sizing signal.
    const el = targets[0];
    const px = resolvePx(token, value);
    const isGap = typeof label === 'string' && label.startsWith('gap.');
    if (px) drawDimensionLine(el, px, getAxis(payload), category, isGap, config.highlightColor, getPaddingSides(payload));
    return;
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  ensureStyle();
  addons.getChannel().on(TOKENS_HIGHLIGHT_EVENT, payload => {
    if (!payload) clearAll();
    else applyHighlight(payload);
  });
}
