import React from 'react';
import { AddonPanel } from 'storybook/internal/components';
import { addons, types, useStorybookApi } from '@storybook/manager-api';
import { TOKENS_HIGHLIGHT_EVENT, resolveConfig } from './constants.js';

const ADDON_ID = 'tokens-storybook-addon';
const PANEL_ID = 'tokens-storybook-addon/panel';

// Motion (duration/easing/delay) is its own category, always last — never mixed into Sizing.
const CATEGORY_ORDER = ['color', 'typography', 'spacing', 'radius', 'sizing', 'shadows', 'motion'];

const CATEGORY_LABELS = {
  color: 'Color',
  typography: 'Typography',
  spacing: 'Spacing',
  radius: 'Radius',
  sizing: 'Sizing',
  shadows: 'Shadows',
  motion: 'Motion',
};

// Panel-local UI accent — deliberately NOT the lilac used to highlight the live
// component in the canvas. The panel's own tabs/row-hover stay on the ordinary
// focus color so lilac reads as one unambiguous signal: "this is on the component".
const PANEL_ACCENT = 'var(--tokens-addon-border-focus, #3b82f6)';
const PANEL_ACCENT_SOFT = 'color-mix(in srgb, var(--tokens-addon-border-focus, #3b82f6) 14%, transparent)';

const TABLE_STYLE = {
  width: '100%',
  borderCollapse: 'collapse',
  marginTop: 16,
  border: '1px solid var(--tokens-addon-border-neutral, #e2e8f0)',
  borderRadius: 12,
  overflow: 'hidden',
  tableLayout: 'fixed',
};

const TH_STYLE = {
  textAlign: 'left',
  padding: '8px 12px',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--tokens-addon-text-muted, #64748b)',
  borderBottom: '1px solid var(--tokens-addon-border-neutral, #e2e8f0)',
  borderRight: '1px solid var(--tokens-addon-border-light, #f1f5f9)',
};

// Small uppercase tag next to an element name — a state (HOVER, DISABLED) or HIDDEN.
const BADGE_STYLE = {
  marginLeft: 6,
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  color: 'var(--tokens-addon-text-muted, #64748b)',
  border: '1px solid var(--tokens-addon-border-neutral, #e2e8f0)',
  borderRadius: 4,
  padding: '1px 5px',
};

const TD_STYLE = {
  padding: '10px 12px',
  verticalAlign: 'top',
  borderRight: '1px solid var(--tokens-addon-border-light, #f1f5f9)',
  borderBottom: '1px solid var(--tokens-addon-border-light, #f1f5f9)',
};

// The panel renders in the Storybook MANAGER's own document — a separate frame from the
// preview iframe, which is the only place `.storybook/preview.ts` actually imports the
// tokens CSS written directly in this file's own inline
// styles therefore never resolves to anything (the manager never defines that custom
// property) — every color swatch silently renders as transparent/blank regardless of which
// component's tokens are showing. Read the REAL resolved value out of the preview iframe's
// live DOM instead (same-origin, same dev server — a plain cross-frame getComputedStyle
// works with no special permissions) and paint the swatch with that literal color, which
// resolves correctly in any document.
function resolvePreviewColor(token) {
  if (!token || typeof document === 'undefined') return undefined;
  const iframe = document.getElementById('storybook-preview-iframe');
  const win = iframe?.contentWindow;
  if (!win) return undefined;
  try {
    const value = win.getComputedStyle(win.document.documentElement).getPropertyValue(token).trim();
    return value || undefined;
  } catch {
    // Cross-frame access can throw before the preview has finished its first paint, or if a
    // consumer's Storybook build serves the preview from a different origin — fall back to
    // the (non-resolving, but harmless) var() reference rather than crashing the panel.
    return undefined;
  }
}

function resolvePreviewValue(token, value, item, config) {
  if (typeof document === 'undefined') return value ?? '';
  const iframe = document.getElementById('storybook-preview-iframe');
  const win = iframe?.contentWindow;
  if (!win) return value ?? '';
  try {
    const element = win.document.querySelector(`[${config.dataAttribute}="${item.part}"]`);
    // Not rendered (a closed Modal/Toast): the token's own value still exists on :root.
    if (!element) return resolveTokenOnly(win, item) || value || '';
    const style = win.getComputedStyle(element);
    const label = `${item.label ?? ''} ${item.token ?? ''}`.toLowerCase();
    // Motion values stay as authored (200ms, cubic-bezier(...)) — never converted to px.
    if (getCategory(item) === 'motion') return (item.token && style.getPropertyValue(item.token).trim()) || value || '';
    if (item.kind === 'space') return resolveSpacePx(win, element, style, item, label) || value || '';
    // A color token's value is the token itself, not whatever property the element happens to
    // paint — Modal's overlay token colors ::backdrop, while the element's own background is
    // the white dialog. Normalized through a probe so every row reads in the same rgb() form.
    if (item.kind === 'color' && item.token) {
      const raw = style.getPropertyValue(item.token).trim();
      if (raw) {
        const probe = win.document.createElement('span');
        probe.style.color = raw;
        win.document.body.appendChild(probe);
        const normalized = win.getComputedStyle(probe).color;
        probe.remove();
        return normalized || raw;
      }
    }
    const property = item.kind === 'typography'
      ? label.includes('family') ? 'fontFamily' : label.includes('weight') ? 'fontWeight' : label.includes('size') ? 'fontSize' : 'lineHeight'
      : item.kind === 'radius' ? 'borderRadius'
        : item.kind === 'shadow' ? 'boxShadow'
          : item.kind === 'color' ? getColorRole(item) === 'background' ? 'backgroundColor' : getColorRole(item) === 'border' ? 'borderTopColor' : 'color'
            : null;
    if (property && style[property]) return style[property];
    // No CSS property to read — show the token's own resolved value rather than an empty cell.
    return (item.token && style.getPropertyValue(item.token).trim()) || value || '';
  } catch {
    return value ?? '';
  }
}

function resolveTokenOnly(win, item) {
  if (!item.token) return '';
  const raw = win.getComputedStyle(win.document.documentElement).getPropertyValue(item.token).trim();
  if (!raw) return '';
  if (item.kind === 'space' && getCategory(item) !== 'motion') {
    const rootPx = parseFloat(win.getComputedStyle(win.document.documentElement).fontSize) || 16;
    const px = toPx(raw.split(' ')[0], rootPx, rootPx);
    return px === null ? raw : `${Math.round(px * 100) / 100}px`;
  }
  if (item.kind === 'color') {
    const probe = win.document.createElement('span');
    probe.style.color = raw;
    win.document.body.appendChild(probe);
    const normalized = win.getComputedStyle(probe).color;
    probe.remove();
    return normalized || raw;
  }
  return raw;
}

// Spacing and Sizing values are ALWAYS shown in px (addon rule — see CONTRACT.md): a token
// written as `2rem` or `calc(...)` is converted, and a row with no matching CSS property
// (e.g. `height.m`, `size`) is measured from the rendered element instead of left blank.
function resolveSpacePx(win, element, style, item, label) {
  const sideProperty = side => (/padding/.test(label) ? `padding${side}` : /margin/.test(label) ? `margin${side}` : null);
  const property = /(top)/.test(label) ? sideProperty('Top')
    : /(right|end)/.test(label) ? sideProperty('InlineEnd')
      : /(bottom)/.test(label) ? sideProperty('Bottom')
        : /(left|start)/.test(label) ? sideProperty('InlineStart')
          : /padding-x|padding\.x/.test(label) ? 'paddingInlineStart'
            : /padding-y|padding\.y/.test(label) ? 'paddingTop'
              : /row-gap/.test(label) ? 'rowGap'
                : /column-gap/.test(label) ? 'columnGap'
                  : /gap/.test(label) ? 'gap'
                    : /width/.test(label) || item.axis === 'horizontal' ? 'width'
                      : /(height|size)/.test(label) ? 'height'
                        : null;
  const rootPx = parseFloat(win.getComputedStyle(win.document.documentElement).fontSize) || 16;
  const asPx = raw => {
    const px = toPx(String(raw ?? '').split(' ')[0], parseFloat(style.fontSize) || rootPx, rootPx);
    return px === null ? null : `${Math.round(px * 100) / 100}px`;
  };
  if (property === 'width' || property === 'height') {
    const rect = element.getBoundingClientRect();
    const measured = property === 'width' ? rect.width : rect.height;
    if (measured > 0) return `${Math.round(measured * 100) / 100}px`;
  }
  if (property && /px$/.test(style[property] ?? '')) return asPx(style[property]);
  if (item.token) return asPx(style.getPropertyValue(item.token).trim());
  return item.value !== undefined ? asPx(item.value) ?? String(item.value) : null;
}

// Typography is shown as ONE row per text element: the component token(s) it consumes, the
// Text Style they resolve to, and every property of that style. Text Styles are discovered from the preview's own stylesheets
// — any custom property matching `config.textStylePattern` (default
// `--{prefix}textStyle-{name}-{fontFamily|fontSize|fontWeight|lineHeight}`) — then matched
// against the element's rendered font-size/weight/line-height/family. Matching the rendered
// result (not the row's declared token) is what makes it work for aliased component tokens
// like `--button-font-size-m`, and for text nobody declared a row for.
const TYPOGRAPHY_PROPERTIES = [
  ['fontFamily', 'font-family'],
  ['fontSize', 'font-size'],
  ['fontWeight', 'font-weight'],
  ['lineHeight', 'line-height'],
];

function getPreviewWindow() {
  if (typeof document === 'undefined') return null;
  return document.getElementById('storybook-preview-iframe')?.contentWindow ?? null;
}

function readTextStyles(config) {
  const win = getPreviewWindow();
  if (!win || !config.textStylePattern) return [];
  try {
    const pattern = new RegExp(config.textStylePattern);
    const names = new Set();
    const visit = rules => {
      for (const rule of Array.from(rules ?? [])) {
        if (rule.style) {
          for (let i = 0; i < rule.style.length; i += 1) {
            if (pattern.test(rule.style[i])) names.add(rule.style[i]);
          }
        }
        // @layer / @media / @supports wrap Tailwind's @theme output — recurse into them.
        if (rule.cssRules) visit(rule.cssRules);
      }
    };
    for (const sheet of Array.from(win.document.styleSheets)) {
      try { visit(sheet.cssRules); } catch { /* cross-origin stylesheet — not readable, skip */ }
    }
    // Values come from the root's computed style, not the rule text, so a style whose
    // sub-properties are themselves `var(--primitive-*)` references resolves to real values.
    const rootStyle = win.getComputedStyle(win.document.documentElement);
    const styles = new Map();
    names.forEach(name => {
      const [, key, property] = name.match(pattern);
      const value = rootStyle.getPropertyValue(name).trim();
      if (!value) return;
      if (!styles.has(key)) styles.set(key, { key, prefix: name.slice(0, name.length - property.length - 1), values: {} });
      styles.get(key).values[property] = value;
    });
    return [...styles.values()].filter(style => style.values.fontSize);
  } catch {
    return [];
  }
}

// `caption-semibold` → `Caption / Semibold`, `heading-3xl-bold` → `Heading / 3xl / Bold` —
// the same Title Case, `/`-joined naming the Text Styles use in Figma. Size steps stay lowercase.
function formatTextStyleName(key) {
  return key.split('-').map(part => (/^\d*x*[sml]$/i.test(part) ? part.toLowerCase() : part.charAt(0).toUpperCase() + part.slice(1))).join(' / ');
}

function toPx(value, emPx, rootPx) {
  const text = String(value ?? '').trim();
  const number = parseFloat(text);
  if (Number.isNaN(number)) return null;
  if (text.endsWith('px')) return number;
  if (text.endsWith('rem')) return number * rootPx;
  if (text.endsWith('em')) return number * emPx;
  if (text.endsWith('%')) return (number / 100) * emPx;
  return number * emPx; // unitless line-height multiplier
}

function fontWeightNumber(value) {
  if (value === 'normal') return 400;
  if (value === 'bold') return 700;
  return Number(value);
}

function primaryFontFamily(value) {
  return String(value ?? '').split(',')[0].replace(/["']/g, '').trim().toLowerCase();
}

function findPartElement(item, config) {
  const doc = getPreviewWindow()?.document;
  if (!doc) return null;
  const scoped = item.variant ? doc.querySelector(`[${config.dataAttribute}="${item.part}"][${config.variantAttribute}="${item.variant}"]`) : null;
  return scoped ?? doc.querySelector(`[${config.dataAttribute}="${item.part}"]`);
}

// The part carrying the token is often a wrapper (`button`) — the text itself lives on a
// descendant (`button-label`). Measure the first element that directly owns a text node.
function findTextElement(element) {
  const ownsText = el => Array.from(el.childNodes).some(node => node.nodeType === 3 && node.textContent.trim());
  if (ownsText(element)) return element;
  return Array.from(element.querySelectorAll('*')).find(ownsText) ?? element;
}

// Which token does each typography property ACTUALLY come from? Read the CSS rules that match
// the text element and take the `var(--token)` each font property is declared with. Font
// properties inherit, so when the element itself declares nothing, walk up its ancestors
// (Modal's title gets its size from its own rule, but a label may inherit its family from the
// component root). This is what the component really consumes — a `.doc.ts` row can be missing
// (no typography rows declared) or stale (rows still naming primitives after the CSS moved to
// component tokens), so the rendered CSS wins over the declared rows.
const TYPOGRAPHY_CSS = [
  ['fontFamily', 'font-family'],
  ['fontSize', 'font-size'],
  ['fontWeight', 'font-weight'],
  ['lineHeight', 'line-height'],
];

function collectStyleRules(win) {
  const rules = [];
  const visit = list => {
    for (const rule of Array.from(list ?? [])) {
      if (rule.selectorText && rule.style) rules.push(rule);
      // @layer / @media / @supports — only keep @media rules that currently apply.
      if (rule.cssRules && (!rule.media || win.matchMedia(rule.media.mediaText).matches)) visit(rule.cssRules);
    }
  };
  for (const sheet of Array.from(win.document.styleSheets)) {
    try { visit(sheet.cssRules); } catch { /* cross-origin stylesheet — not readable, skip */ }
  }
  return rules;
}

function declaredVar(rules, element, cssName) {
  let found = null;
  for (const rule of rules) {
    const value = rule.style.getPropertyValue(cssName);
    if (!value) continue;
    let matches = false;
    try { matches = element.matches(rule.selectorText); } catch { /* selector the engine can't match (pseudo-elements) */ }
    if (!matches) continue;
    // Later rules in source order win — a close-enough cascade for component CSS, which
    // targets one part per rule. `found = ''` records "declared, but not with a token".
    found = value.match(/var\(\s*(--[^,\s)]+)/)?.[1] ?? '';
  }
  return found;
}

function readTypographyTokens(win, target, rules) {
  const tokens = {};
  TYPOGRAPHY_CSS.forEach(([property, cssName]) => {
    for (let node = target; node && node.nodeType === 1; node = node.parentElement) {
      const token = declaredVar(rules, node, cssName);
      if (token === null) continue;
      if (token) tokens[property] = token;
      break;
    }
  });
  return tokens;
}

function readTypography(item, config, textStyles, rules) {
  const win = getPreviewWindow();
  const element = findPartElement(item, config);
  if (!win || !element) return null;
  try {
    const target = findTextElement(element);
    const style = win.getComputedStyle(target);
    const rootPx = parseFloat(win.getComputedStyle(win.document.documentElement).fontSize) || 16;
    const sizePx = parseFloat(style.fontSize);
    const lineHeightPx = style.lineHeight === 'normal' ? null : parseFloat(style.lineHeight);
    // Does each of a style's properties match what's rendered? font-size + font-weight identify
    // the style; line-height and family only rank candidates. Requiring all four would hide
    // the style whenever a component overrides one of them (Avatar's `line-height: 1`, or text
    // that never picks up the style's font-family).
    const matches = values => ({
      fontSize: Math.abs((toPx(values.fontSize, rootPx, rootPx) ?? -1) - sizePx) <= 0.5,
      fontWeight: !values.fontWeight || fontWeightNumber(values.fontWeight) === fontWeightNumber(style.fontWeight),
      lineHeight: !values.lineHeight || lineHeightPx === null
        || Math.abs((toPx(values.lineHeight, toPx(values.fontSize, rootPx, rootPx), rootPx) ?? -1) - lineHeightPx) <= 0.5,
      fontFamily: !values.fontFamily || primaryFontFamily(values.fontFamily) === primaryFontFamily(style.fontFamily),
    });
    let textStyle = null;
    let textStyleMatches = null;
    let bestScore = -1;
    textStyles.forEach(candidate => {
      const result = matches(candidate.values);
      if (!result.fontSize || !result.fontWeight) return;
      const score = (result.lineHeight ? 2 : 0) + (result.fontFamily ? 1 : 0);
      if (score > bestScore) [textStyle, textStyleMatches, bestScore] = [candidate, result, score];
    });
    const values = TYPOGRAPHY_PROPERTIES.map(([property, cssName]) => {
      const rendered = style[property];
      const declared = textStyle?.values[property];
      if (!declared) return { cssName, text: rendered };
      // A unitless line-height (e.g. `1.5`) is what the style says; the px is what it renders as.
      const text = property === 'lineHeight' && declared !== rendered && textStyleMatches[property] ? `${declared} (${rendered})` : declared;
      return { cssName, text };
    });
    const cssTokens = readTypographyTokens(win, target, rules ?? collectStyleRules(win));
    return { target, textStyle, values, cssTokens };
  } catch {
    return null;
  }
}

// Collapse every typography row of one element (fontSize/fontWeight/... declared or
// computed) into one row. Two parts that render the SAME text node (`button` declared,
// `button-label` discovered) collapse too — declared rows come first, so they win.
// Which of the four typography properties a declared row's token is for.
function typographyProperty(item) {
  const text = `${item.label ?? ''} ${item.token ?? ''}`.toLowerCase();
  return /family/.test(text) ? 'fontFamily' : /weight/.test(text) ? 'fontWeight' : /line/.test(text) ? 'lineHeight' : 'fontSize';
}

// A text element that isn't rendered (closed Modal/Toast) can't be measured — show the values
// of the component tokens it declares instead, read from :root.
function typographyFromTokens(win, row) {
  const root = win ? win.getComputedStyle(win.document.documentElement) : null;
  const values = TYPOGRAPHY_PROPERTIES.map(([property, cssName]) => {
    const token = row.tokens?.[property];
    return { cssName, text: (token && root?.getPropertyValue(token).trim()) || '—' };
  });
  return { target: null, textStyle: null, values, cssTokens: {} };
}

function groupTypographyRows(items, config, textStyles) {
  const groups = new Map();
  items.forEach(item => {
    const key = [item.part, item.variant ?? '', item.state ?? ''].join('|');
    const declaredMeta = item.source === 'computed' ? undefined : item.meta;
    const declaredToken = item.source === 'computed' ? undefined : item.token;
    const existing = groups.get(key);
    if (existing) {
      existing.meta = existing.meta ?? declaredMeta;
      if (declaredToken) existing.tokens[typographyProperty(item)] ??= declaredToken;
      return;
    }
    const tokens = {};
    if (declaredToken) tokens[typographyProperty(item)] = declaredToken;
    groups.set(key, { part: item.part, variant: item.variant, state: item.state, size: item.size, kind: 'typography', label: item.part, meta: declaredMeta, tokens, typographyRow: true });
  });
  const seenTargets = new Set();
  const rows = [];
  const win = getPreviewWindow();
  const rules = win ? collectStyleRules(win) : [];
  groups.forEach(row => {
    const typography = readTypography(row, config, textStyles, rules);
    if (typography?.target) {
      if (seenTargets.has(typography.target)) return;
      seenTargets.add(typography.target);
    }
    rows.push({ ...row, typography: typography ?? typographyFromTokens(win, row) });
  });
  return rows;
}

const MUTED_TEXT = 'var(--tokens-addon-text-muted, #64748b)';

// Token column: one line per typography property — the component token that property
// consumes, aligned with the same line in Value — and the Text Style as the description.
// A property with no component token says so instead of silently disappearing.
const TYPOGRAPHY_LINE = { height: 18, display: 'flex', alignItems: 'center', minWidth: 0 };

function renderTextStyleCell(item) {
  const textStyle = item.typography?.textStyle;
  return React.createElement(
    React.Fragment,
    null,
    TYPOGRAPHY_PROPERTIES.map(([property]) => {
      const token = item.typography?.cssTokens?.[property] ?? item.tokens?.[property];
      return React.createElement(
        'div',
        { key: property, style: TYPOGRAPHY_LINE },
        token
          ? React.createElement('code', { title: token, style: { fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, token)
          : React.createElement('span', { style: { fontSize: 11, fontStyle: 'italic', color: MUTED_TEXT, whiteSpace: 'nowrap' } }, 'no component token'),
      );
    }),
    React.createElement(
      'span',
      { style: { display: 'block', marginTop: 4, fontSize: 11, color: MUTED_TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
      textStyle ? formatTextStyleName(textStyle.key) : 'No Text Style',
    ),
  );
}

function renderTypographyValues(item) {
  const values = item.typography?.values ?? [];
  return React.createElement(
    'div',
    { style: { display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: 10 } },
    values.flatMap(({ cssName, text }) => [
      React.createElement('span', { key: `${cssName}-name`, style: { ...TYPOGRAPHY_LINE, fontSize: 11, color: MUTED_TEXT } }, cssName),
      React.createElement('span', { key: `${cssName}-value`, style: TYPOGRAPHY_LINE },
        React.createElement('code', { title: text, style: { fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, text)),
    ]),
  );
}

// A row is only relevant if its `part` is actually rendered in the CURRENT story instance —
// e.g. Card's `card-header` (and its `border-bottom` divider token) only exists in the DOM when
// that story passes a `header` prop; a story with no header should never show that row, even
// though the doc.ts token list includes it as part of Card's full surface. Reads the preview
// iframe's live DOM (same cross-frame approach as resolvePreviewColor) rather than trying to
// infer presence from args, since "does this part exist" is exactly what the DOM already knows.
function getPresentParts(config) {
  if (typeof document === 'undefined') return null;
  const iframe = document.getElementById('storybook-preview-iframe');
  const doc = iframe?.contentDocument;
  if (!doc) return null;
  try {
    const present = new Set();
    doc.querySelectorAll(`[${config.dataAttribute}]`).forEach(el => present.add(el.getAttribute(config.dataAttribute)));
    return present;
  } catch {
    // Cross-frame access can throw before the preview has finished its first paint.
    return null;
  }
}

function discoverComputedTokens(config) {
  const iframe = document.getElementById('storybook-preview-iframe');
  const doc = iframe?.contentDocument;
  if (!doc) return [];
  const discovered = [];
  const rules = collectStyleRules(iframe.contentWindow);
  doc.querySelectorAll(`[${config.dataAttribute}]`).forEach(element => {
    const part = element.getAttribute(config.dataAttribute);
    const hasText = Boolean(element.textContent?.trim());
    const hasTextPartChild = Array.from(element.querySelectorAll(`[${config.dataAttribute}]`)).some(child => child.textContent?.trim());
    const text = hasText && !hasTextPartChild;
    if (!part || !text || element.getBoundingClientRect().width <= 0 || element.getBoundingClientRect().height <= 0) return;
    const style = iframe.contentWindow.getComputedStyle(element);
    for (const [label, property] of [['fontFamily', 'fontFamily'], ['fontSize', 'fontSize'], ['fontWeight', 'fontWeight'], ['lineHeight', 'lineHeight']]) {
      discovered.push({ part, label, value: style[property], kind: 'typography', meta: 'Computed from rendered CSS', source: 'computed' });
    }
    // Which token actually colors this text? Same CSS-rule lookup as typography, walking up to
    // the ancestor that declares `color` (Modal colors its root; the title inherits). A token
    // found here is reported AS a token — a token never shows as a hardcoded value. Only text
    // with no token behind its color at all gets the raw rendered value.
    const colorToken = readDeclaredToken(element, 'color', rules);
    discovered.push(colorToken
      ? { part, label: 'text', token: colorToken, kind: 'color', colorRole: 'text', source: 'computed' }
      : { part, label: 'text', value: style.color, kind: 'color', colorRole: 'text', meta: 'Not documented — no token applied', source: 'computed' });
  });
  return discovered;
}

// Walk up from `element` to the first node with a matching rule that declares `cssName`, and
// return the token it uses (null when the nearest declaration is a literal, or nothing declares it).
function readDeclaredToken(element, cssName, rules) {
  for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
    const token = declaredVar(rules, node, cssName);
    if (token === null) continue;
    return token || null;
  }
  return null;
}

function normalizeKind(kind) {
  if (kind === 'color' || kind === 'typography' || kind === 'space' || kind === 'shadow' || kind === 'radius' || kind === 'animation') return kind;
  return 'other';
}

function inferSpaceKind(item) {
  const text = `${item.part ?? ''} ${item.label ?? ''} ${item.token ?? ''}`.toLowerCase();
  if (/(padding|margin|gap|space|inset|offset)/.test(text)) return 'spacing';
  return 'sizing';
}

function isMotionToken(item) {
  return /duration|easing|delay|transition|motion|animation/i.test(`${item.label ?? ''} ${item.token ?? ''}`);
}

function getCategory(item) {
  if (item.kind === 'animation' || item.kind === 'motion' || isMotionToken(item)) return 'motion';
  const kind = normalizeKind(item.kind);
  if (kind === 'space') return inferSpaceKind(item);
  if (kind === 'shadow') return 'shadows';
  return kind;
}

function getColorRole(item) {
  if (item.colorRole) return item.colorRole;
  const text = `${item.label ?? ''} ${item.token ?? ''}`.toLowerCase();
  if (/background|fill|surface|track|overlay|backdrop|scrim/.test(text)) return 'background';
  if (/border|outline|divider|ring/.test(text)) return 'border';
  if (/icon|chevron|thumb|dot/.test(text)) return 'icon';
  if (/asset|illustration|image|graphic/.test(text)) return 'asset';
  return 'text';
}

// Must be unique per row, not just per token — two rows can legitimately share the exact
// same part+token (e.g. Textarea's padding.top/bottom/start/end are all the literal same
// the same spacing token, since the field has uniform padding on every side). Using
// only part+token here previously collided those rows onto one key, so hovering any one of
// them lit up all four at once (React `key` reuse + a single `hoveredRow` string matching
// every row with that colliding key). `label` (plus state/size/variant, when set) is what
// actually distinguishes them — always include it, never fall back to it only when token
// is absent.
function rowKeyFor(item) {
  return [item.part, item.label, item.token ?? item.value ?? '', item.state ?? '', item.size ?? '', item.variant ?? '', item.colorRole ?? '', item.padding ?? '', (item.paddingSides ?? []).join(','), item.relationship ?? ''].join('|');
}

function displayLabel(item, labelCounts, category) {
  const base = item.label || item.part;
  if (category === 'color') {
    const role = getColorRole(item);
    const part = `${item.part ?? ''} ${item.meta ?? ''}`.toLowerCase();
    if (role === 'text' && /header|title|heading/.test(part)) return 'header';
    if (role === 'text' && /description|body|content/.test(part)) return 'description';
    if (role === 'text' && /caption|counter|helper|error/.test(part)) return 'caption';
    if (/fill|background|surface|border|outline|divider|ring|icon|asset|illustration/i.test(base)) return role;
  }
  if (category === 'spacing' && item.relationship) return item.relationship;
  if (category === 'spacing') return base;
  if (category === 'typography') {
    const part = `${item.part ?? ''} ${item.meta ?? ''}`.toLowerCase();
    const group = /header|title|heading/.test(part) ? 'text-header'
      : /description|body|content/.test(part) ? 'text-description'
        : /caption|counter|helper|error/.test(part) ? 'text-caption'
          : 'text';
    return base;
  }
  if ((labelCounts.get(base) ?? 0) < 2) return base;
  const part = `${item.part ?? ''} ${item.meta ?? ''}`.toLowerCase();
  let suffix = part.match(/header|title|heading/)?.[0]
    ?? (/(description|body|content)/.test(part) ? 'description' : undefined)
    ?? part.match(/caption|counter|helper|error/)?.[0]
    ?? item.part;
  suffix = String(suffix).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  return `${base}-${suffix}`;
}

// Which text a color row is about — value and placeholder (or label and description) are
// different things with different tokens, so each gets its own section, not one "text" pile.
const TEXT_KINDS = ['placeholder', 'value', 'description', 'error', 'helper', 'counter', 'caption', 'title', 'header', 'legend', 'label'];
function textKind(item) {
  const text = `${item.label ?? ''} ${item.token ?? ''} ${item.part ?? ''}`.toLowerCase();
  return TEXT_KINDS.find(kind => text.includes(kind)) ?? String(item.part ?? 'text').split('-').pop();
}

const COLOR_SECTION_ORDER = ['background', 'border', 'text', 'icon', 'asset'];
function colorSectionRank(item) {
  const rank = COLOR_SECTION_ORDER.indexOf(getColorRole(item));
  return rank === -1 ? COLOR_SECTION_ORDER.length : rank;
}

// Typography is already one row per element (see groupTypographyRows) — no sub-headers.
function groupLabel(item, category) {
  if (category === 'color') {
    const role = getColorRole(item);
    return role === 'text' ? `text · ${textKind(item)}` : role;
  }
  return category === 'spacing' ? item.part : null;
}

// A row only shows when it matches what's actually on screen right now:
// - `variant`/`size` narrow to the currently selected story args (when the row itself
//   is tagged with one — untagged rows are variant/size-agnostic and always pass).
// - `state: 'disabled'` rows are opt-in: they only show once the story's own `disabled`
//   arg is actually turned on, unlike `hover`/`press` rows (untagged as `state`), which
//   are pointer states of an always-interactive component and so always show.
// - `part` must actually exist in the live DOM right now — a row for a sub-part that's
//   conditionally rendered (Card's `card-header`, only present when `header` is passed)
//   shouldn't show for a story instance that doesn't render it, even though it's a real
//   part of the component's full documented surface. `presentParts === null` means the
//   iframe DOM wasn't readable yet — fail OPEN (show the row) rather than hide everything
//   while the preview is still loading.
function matchesStoryState(item, args, presentParts) {
  if (args?.variant && item.variant && item.variant !== args.variant) return false;
  if (args?.size && item.size && item.size !== args.size) return false;
  if (item.state === 'disabled' && args?.disabled !== true) return false;
  if (presentParts && item.part && !presentParts.has(item.part)) return false;
  return true;
}

// Is this part on screen right now? Present in the DOM AND not hidden (display none,
// visibility hidden, opacity 0 — a closed tooltip still has a layout box).
function isPartVisible(part, config) {
  const doc = getPreviewWindow()?.document;
  const win = getPreviewWindow();
  if (!doc || !win || !part) return false;
  try {
    return Array.from(doc.querySelectorAll(`[${config.dataAttribute}="${part}"]`)).some(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
        const style = win.getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return false;
      }
      return true;
    });
  } catch {
    return false;
  }
}

// Addon rule: a component that only appears after interaction (Modal, Toast, Tooltip, Menu...)
// still shows ALL of its tokens. When none of the story's declared parts is visible, the whole
// component is hidden — so every row is shown (tagged HIDDEN) instead of an empty panel. A
// component that IS on screen keeps hiding sub-parts the story doesn't render (Card's header).
function isHiddenComponent(declaredTokens, presentParts, config) {
  if (presentParts === null || !declaredTokens.length) return false;
  return !declaredTokens.some(item => isPartVisible(item.part, config));
}

function isRenderableToken(item, presentParts, config) {
  if (presentParts === null) return true;
  if (!presentParts || !item.part || !presentParts.has(item.part)) return false;
  const iframe = document.getElementById('storybook-preview-iframe');
  const doc = iframe?.contentDocument;
  const element = doc?.querySelector(`[${config.dataAttribute}="${item.part}"]`);
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  if (item.token || item.value !== undefined) return true;
  return false;
}

function TokensPanel({ active }) {
  const api = useStorybookApi();
  const currentStory = api.getCurrentStoryData?.();
  // `args` only holds values the story/user actually set; a prop's component-level
  // default (e.g. Button's `size = 'm'`) lives in `initialArgs` instead. Merge both so
  // filtering narrows to the real default even before anyone touches a control.
  const currentArgs = { ...currentStory?.initialArgs, ...currentStory?.args };
  const declaredTokens = currentStory?.parameters?.tokens ?? [];
  const config = resolveConfig(currentStory?.parameters);
  const [category, setCategory] = React.useState('color');
  const [hoveredRow, setHoveredRow] = React.useState(null);
  const channel = React.useMemo(() => addons.getChannel(), []);

  // Swatch colors are read live from the preview iframe (see resolvePreviewColor) — on
  // story navigation the iframe reloads and re-imports the tokens CSS, so a color read
  // immediately on this panel's own re-render can land before that's ready. `paintTick`
  // just forces one more render shortly after, by which point the preview has painted.
  const [paintTick, setPaintTick] = React.useState(0);
  React.useEffect(() => {
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => setPaintTick(t => t + 1));
      return () => cancelAnimationFrame(raf2);
    });
    // A story can still be mounting after two frames (portals, motion, lazy content) — re-read
    // a few more times so the panel never gets stuck on an early, empty DOM.
    const timers = [250, 800, 1600].map(ms => setTimeout(() => setPaintTick(t => t + 1), ms));
    return () => {
      cancelAnimationFrame(raf1);
      timers.forEach(clearTimeout);
    };
    // Re-check shortly after story navigation AND after any arg change (e.g. toggling a
    // control that conditionally renders a part, like Card's `header`) — both can change
    // which part elements actually exist in the preview DOM.
  }, [currentStory?.id, JSON.stringify(currentArgs)]);

  const presentParts = React.useMemo(() => getPresentParts(config), [config, currentStory?.id, JSON.stringify(currentArgs), paintTick]);
  // Every value this panel shows is read from the live preview DOM — but hovering a row makes
  // the preview repaint that element in the highlight color (overriding its token inline), and
  // the hover itself re-renders this panel. Reading the DOM again at that moment reported the
  // highlight lilac as the token's value. So everything read from the DOM is snapshotted once
  // per story / args / paint, and hover renders only ever reuse that snapshot — they never
  // trigger a new read. (Deliberately NOT keyed on `declaredTokens`: `?? []` is a fresh array
  // every render for a story without tokens, which re-ran discovery on every hover.)
  const snapshotKey = `${currentStory?.id}|${JSON.stringify(currentArgs)}|${paintTick}`;
  const snapshotRef = React.useRef({ key: null, values: new Map() });
  if (snapshotRef.current.key !== snapshotKey) snapshotRef.current = { key: snapshotKey, values: new Map() };
  function snapshot(id, read) {
    const values = snapshotRef.current.values;
    if (!values.has(id)) values.set(id, read());
    return values.get(id);
  }

  const tokens = React.useMemo(() => {
    // A computed row only fills a gap: skip it when the element already has a declared row for
    // the same thing — same kind and (for color) same role — whatever label that row uses.
    // Matching on label let Table's declared `color` and the computed `text` for the same
    // header cell both show up as "header".
    const covered = new Set(declaredTokens.map(item => `${normalizeKind(item.kind)}|${item.part}|${item.kind === 'color' ? getColorRole(item) : ''}`));
    const coveredKey = item => `${normalizeKind(item.kind)}|${item.part}|${item.kind === 'color' ? getColorRole(item) : ''}`;
    // ...or when its token is already documented on THIS element or one that contains it
    // (Select declares its value color on the trigger; the text inside inherits it). The same
    // token documented on an unrelated element doesn't count: Modal's title, body and footer
    // all inherit the same text token from the root, and each is its own text to document.
    const doc = getPreviewWindow()?.document;
    const partElement = part => doc?.querySelector(`[${config.dataAttribute}="${part}"]`) ?? null;
    const documentedAbove = item => {
      if (!item.token) return false;
      const el = partElement(item.part);
      return declaredTokens.some(row => {
        if (row.token !== item.token) return false;
        const owner = partElement(row.part);
        return Boolean(owner && el && owner.contains(el));
      });
    };
    return [...declaredTokens, ...discoverComputedTokens(config).filter(item => !covered.has(coveredKey(item)) && !documentedAbove(item))];
  }, [snapshotKey]);
  const textStyles = React.useMemo(() => readTextStyles(config), [snapshotKey]);
  // Not snapshotted: visibility isn't touched by hover highlights, and caching it froze a
  // too-early "not hidden" read taken before the story had rendered (Toast showed no rows).
  const hiddenComponent = isHiddenComponent(declaredTokens, presentParts, config);
  const rowShows = item => (hiddenComponent
    ? matchesStoryState(item, currentArgs, null)
    : matchesStoryState(item, currentArgs, presentParts) && isRenderableToken(item, presentParts, config));

  // The preview iframe reloads its story on navigation — a highlight left over from a
  // hovered row in the previous story would otherwise point at DOM that no longer exists.
  React.useEffect(() => {
    return () => channel.emit(TOKENS_HIGHLIGHT_EVENT, null);
  }, [channel, currentStory?.id]);

  function highlightComponent(item) {
    setHoveredRow(item ? rowKeyFor(item) : null);
    channel.emit(
      TOKENS_HIGHLIGHT_EVENT,
      item
        ? { part: item.part, variant: item.variant, category: getCategory(item), token: item.token, value: item.value, label: item.label, meta: item.meta, axis: item.axis, padding: item.padding, paddingSides: item.paddingSides, relationship: item.relationship, colorRole: getColorRole(item), config }
        : null,
    );
  }

  const categories = React.useMemo(() => {
    const present = CATEGORY_ORDER.filter(kind => tokens.some(item => getCategory(item) === kind && rowShows(item)));
    return present;
  }, [tokens, currentArgs, presentParts, hiddenComponent]);

  React.useEffect(() => {
    if (!categories.length) return;
    if (!categories.includes(category)) {
      setCategory(categories[0]);
    }
  }, [category, categories]);

  const filtered = React.useMemo(
    () => tokens.filter(item => getCategory(item) === category && rowShows(item)),
    [tokens, category, currentArgs, presentParts, hiddenComponent],
  );

  const uniqueFiltered = React.useMemo(() => {
    const seen = new Set();
    return filtered.filter(item => {
      const key = [
        normalizeKind(item.kind),
        item.part,
        item.label,
        item.token ?? '',
        item.value ?? '',
        item.variant ?? '',
        item.meta ?? '',
        item.colorRole ?? '',
        item.padding ?? '',
        (item.paddingSides ?? []).join(','),
        item.relationship ?? '',
      ].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [filtered]);
  // Goes through the snapshot too: `currentArgs` is a new object every render, so a memo here
  // would still re-read the DOM on each hover.
  const rows = category === 'typography'
    ? snapshot(`typography|${uniqueFiltered.map(rowKeyFor).join(',')}`, () => groupTypographyRows(uniqueFiltered, config, textStyles))
    : category === 'color'
      // Keep each color section together so its header appears once: background, border,
      // then one TEXT section per kind of text, then icon/asset. Stable within a section.
      ? [...uniqueFiltered].sort((x, y) => colorSectionRank(x) - colorSectionRank(y) || (groupLabel(x, 'color') < groupLabel(y, 'color') ? -1 : groupLabel(x, 'color') > groupLabel(y, 'color') ? 1 : 0))
      : uniqueFiltered;
  const labelCounts = React.useMemo(() => {
    const counts = new Map();
    rows.forEach(item => counts.set(item.label || item.part, (counts.get(item.label || item.part) ?? 0) + 1));
    return counts;
  }, [rows]);
  // Addon rule: inside one section no two elements share a name. Rows that would collide get
  // the suffix that tells them apart, taken from their tokens (`border` ×4 → border-default,
  // border-checked, border-focus, border-invalid); state/variant/size/part when tokens don't.
  const finalLabels = React.useMemo(() => {
    const clashes = new Map();
    rows.forEach(item => {
      const key = `${groupLabel(item, category) ?? ''}|${String(displayLabel(item, labelCounts, category) ?? '').toLowerCase()}`;
      if (!clashes.has(key)) clashes.set(key, []);
      clashes.get(key).push(item);
    });
    const labels = new Map();
    clashes.forEach((items, key) => {
      const base = key.slice(key.indexOf('|') + 1);
      if (items.length < 2) {
        labels.set(rowKeyFor(items[0]), base);
        return;
      }
      const segments = items.map(item => String(item.token ?? '').replace(/^--/, '').split('-'));
      let shared = 0;
      while (segments.every(seg => seg[shared] !== undefined && seg[shared] === segments[0][shared])) shared += 1;
      const used = new Set();
      items.forEach((item, index) => {
        const fromToken = item.token ? segments[index].slice(shared).join('-') : '';
        let suffix = (fromToken || item.state || item.variant || item.size || String(item.part ?? '').split('-').pop() || String(index + 1)).toLowerCase();
        if (used.has(suffix)) suffix = `${suffix}-${index + 1}`;
        used.add(suffix);
        labels.set(rowKeyFor(item), base.endsWith(`-${suffix}`) ? base : `${base}-${suffix}`);
      });
    });
    return labels;
  }, [rows, category, labelCounts]);

  const groupCounts = React.useMemo(() => {
    const counts = new Map();
    rows.forEach(item => {
      const group = groupLabel(item, category);
      if (group) counts.set(group, (counts.get(group) ?? 0) + 1);
    });
    return counts;
  }, [rows, category]);

  const showPreviewColumn = category === 'color';
  const isTypography = category === 'typography';

  return React.createElement(
    AddonPanel,
    { active },
    React.createElement(
      'div',
      {
        style: { padding: '24px', overflowX: 'auto' },
        // The canvas can change without any arg change (opening a Modal, showing a Toast).
        // Re-read the preview when the pointer comes back to the panel — no row is hovered at
        // that moment, so the fresh snapshot never captures a highlight color.
        onMouseEnter: () => setPaintTick(t => t + 1),
      },
      React.createElement(
        'div',
        { style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 } },
        categories.map(item =>
          React.createElement(
            'button',
            {
              key: item,
              type: 'button',
              onClick: () => setCategory(item),
              style: {
                border: `1px solid ${category === item ? PANEL_ACCENT : 'var(--tokens-addon-border-neutral, #e2e8f0)'}`,
                borderRadius: 999,
                padding: '4px 9px',
                fontSize: 11,
                background: category === item ? PANEL_ACCENT_SOFT : 'var(--tokens-addon-fill-surface, #f8fafc)',
                color: category === item ? PANEL_ACCENT : 'var(--tokens-addon-text-neutral, #0f172a)',
                cursor: 'pointer',
                font: 'inherit',
              },
            },
            CATEGORY_LABELS[item] ?? item,
          ),
        ),
      ),
      rows.length > 0
        ? React.createElement(
            'table',
            { style: TABLE_STYLE },
            React.createElement(
              'thead',
              null,
              React.createElement(
                'tr',
                null,
                React.createElement('th', { style: { ...TH_STYLE, width: showPreviewColumn ? '32%' : isTypography ? '26%' : '38%' } }, 'Element'),
                React.createElement('th', { style: { ...TH_STYLE, width: showPreviewColumn ? '38%' : isTypography ? '34%' : '42%' } }, 'Token'),
                React.createElement('th', { style: { ...TH_STYLE, width: isTypography ? '40%' : '18%' } }, 'Value'),
                showPreviewColumn ? React.createElement('th', { style: { ...TH_STYLE, borderRight: 'none' } }, 'Preview') : null,
              ),
            ),
            React.createElement(
              'tbody',
              null,
              rows.map((item, index) => {
                const tokenText = item.token ?? item.value ?? '';
                const key = rowKeyFor(item);
                const isHovered = hoveredRow === key;
                const row = React.createElement('tr', {
                    key,
                    onMouseEnter: () => highlightComponent(item),
                    onMouseLeave: () => highlightComponent(null),
                    style: { background: isHovered ? PANEL_ACCENT_SOFT : 'transparent' },
                  },
                  React.createElement(
                    'td',
                    { style: TD_STYLE },
                    // Element names are always lowercase (section headers are always UPPERCASE).
                    finalLabels.get(key) ?? String(displayLabel(item, labelCounts, category) ?? '').toLowerCase(),
                    // Shown even though it's not on screen (addon rule for components that only
                    // appear after interaction) — say so, so an empty highlight isn't a surprise.
                    item.part && !snapshot(`visible|${item.part}`, () => isPartVisible(item.part, config))
                      ? React.createElement('span', { style: BADGE_STYLE, title: 'Not on screen — interact with the component to see it' }, 'hidden')
                      : null,
                    // Several rows can legitimately share one Element label (default/hover/press
                    // of the same fill) — without this they read as duplicate rows. The state
                    // badge is what actually tells them apart at a glance.
                    item.state
                      ? React.createElement('span', { style: BADGE_STYLE }, item.state)
                      : null,
                  ),
                  React.createElement(
                    'td',
                    { style: { ...TD_STYLE, borderRight: showPreviewColumn ? TD_STYLE.borderRight : 'none', overflow: 'hidden' } },
                    item.typographyRow
                      ? renderTextStyleCell(item)
                      : React.createElement('code', { style: { fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' } }, tokenText),
                    item.meta && !item.typographyRow ? React.createElement('span', { style: { display: 'block', marginTop: 2, fontSize: 11, color: 'var(--tokens-addon-text-muted, #64748b)' } }, item.meta) : null,
                  ),
                  React.createElement(
                    'td',
                    { style: { ...TD_STYLE, borderRight: showPreviewColumn ? TD_STYLE.borderRight : 'none' } },
                    item.typographyRow
                      ? renderTypographyValues(item)
                      : React.createElement('code', { style: { fontSize: 12 } }, snapshot(`value|${key}`, () => resolvePreviewValue(item.token, item.value, item, config))),
                    !item.token && !item.typographyRow ? React.createElement('span', { style: { display: 'block', marginTop: 2, fontSize: 10, color: 'var(--tokens-addon-text-muted, #64748b)' } }, 'hardcoded') : null,
                  ),
                  showPreviewColumn
                    ? React.createElement(
                        'td',
                        { style: { padding: '10px 12px', verticalAlign: 'middle', borderBottom: '1px solid var(--tokens-addon-border-light, #f1f5f9)' } },
                        React.createElement('span', {
                          title: item.token ? `var(${item.token})` : item.value ?? '',
                          style: {
                            display: 'inline-block',
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            border: '1px solid var(--tokens-addon-border-neutral, #e2e8f0)',
                            // resolvePreviewColor reads the REAL value from the preview iframe —
                            // a bare var(--token) written here never resolves (this panel's own
                            // document doesn't define that custom property; see the function's
                            // own comment). Falls back to the unresolved var()/literal only if
                            // the iframe read fails, so the swatch degrades instead of crashing.
                            backgroundColor: (item.token && snapshot(`color|${key}`, () => resolvePreviewColor(item.token)))
                              || (item.token ? `var(${item.token})` : item.value ?? ''),
                          },
                        }),
                      )
                    : null,
                );
                const group = groupLabel(item, category);
                const previousGroup = index > 0 ? groupLabel(rows[index - 1], category) : null;
                if (group && groupCounts.get(group) >= (category === 'color' ? 1 : 2) && (index === 0 || previousGroup !== group)) return React.createElement(React.Fragment, { key },
                  React.createElement('tr', { key: `${key}-group` }, React.createElement('td', { colSpan: showPreviewColumn ? 4 : 3, style: { ...TH_STYLE, textTransform: 'uppercase', background: 'var(--tokens-addon-fill-surface, #f8fafc)', borderRight: 'none' } }, String(group).toUpperCase())),
                  row,
                );
                return row;
              }),
            ),
          )
        : React.createElement('p', { style: { margin: '16px 0 0', color: 'var(--tokens-addon-text-light, #475569)' } }, 'No tokens defined for this category.'),
    ),
  );
}

addons.register(ADDON_ID, (api) => {
  addons.add(PANEL_ID, {
    id: PANEL_ID,
    type: types.PANEL,
    title: 'Tokens',
    disabled: parameters => !parameters?.tokens?.length,
    render: ({ active }) => React.createElement(TokensPanel, { active }),
  });
});
