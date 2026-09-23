import React from 'react';
import { AddonPanel } from 'storybook/internal/components';
import { addons, types, useStorybookApi } from '@storybook/manager-api';
import { HELIX_HIGHLIGHT_EVENT, resolveConfig } from './constants.js';

const ADDON_ID = 'helix-ds/storybook-addon-tokens';
const PANEL_ID = 'helix-ds/storybook-addon-tokens/panel';

const CATEGORY_ORDER = ['color', 'typography', 'spacing', 'radius', 'sizing', 'shadows'];

const CATEGORY_LABELS = {
  color: 'Color',
  typography: 'Typography',
  spacing: 'Spacing',
  radius: 'Radius',
  sizing: 'Sizing',
  shadows: 'Shadows',
};

// Panel-local UI accent — deliberately NOT the lilac used to highlight the live
// component in the canvas. The panel's own tabs/row-hover stay on the ordinary
// focus color so lilac reads as one unambiguous signal: "this is on the component".
const PANEL_ACCENT = 'var(--helix-color-border-focus, #3b82f6)';
const PANEL_ACCENT_SOFT = 'color-mix(in srgb, var(--helix-color-border-focus, #3b82f6) 14%, transparent)';

const TABLE_STYLE = {
  width: '100%',
  borderCollapse: 'collapse',
  marginTop: 16,
  border: '1px solid var(--helix-color-border-neutral, #e2e8f0)',
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
  color: 'var(--helix-color-text-neutral-lightest, #64748b)',
  borderBottom: '1px solid var(--helix-color-border-neutral, #e2e8f0)',
  borderRight: '1px solid var(--helix-color-border-neutral-light, #f1f5f9)',
};

const TD_STYLE = {
  padding: '10px 12px',
  verticalAlign: 'top',
  borderRight: '1px solid var(--helix-color-border-neutral-light, #f1f5f9)',
  borderBottom: '1px solid var(--helix-color-border-neutral-light, #f1f5f9)',
};

// The panel renders in the Storybook MANAGER's own document — a separate frame from the
// preview iframe, which is the only place `.storybook/preview.ts` actually imports the
// tokens CSS. `var(--helix-table-header-color)` written directly in this file's own inline
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

// A row is only relevant if its `part` is actually rendered in the CURRENT story instance —
// e.g. Card's `card-header` (and its `border-bottom` divider token) only exists in the DOM when
// that story passes a `header` prop; a story with no header should never show that row, even
// though the doc.ts token list includes it as part of Card's full surface. Reads the preview
// iframe's live DOM (same cross-frame approach as resolvePreviewColor) rather than trying to
// infer presence from args, since "does this part exist" is exactly what the DOM already knows.
function getPresentParts() {
  if (typeof document === 'undefined') return null;
  const iframe = document.getElementById('storybook-preview-iframe');
  const doc = iframe?.contentDocument;
  if (!doc) return null;
  try {
    const present = new Set();
    doc.querySelectorAll('[data-helix-part]').forEach(el => present.add(el.getAttribute('data-helix-part')));
    return present;
  } catch {
    // Cross-frame access can throw before the preview has finished its first paint.
    return null;
  }
}

function normalizeKind(kind) {
  if (kind === 'color' || kind === 'typography' || kind === 'space' || kind === 'shadow' || kind === 'radius') return kind;
  return 'other';
}

function inferSpaceKind(item) {
  const text = `${item.part ?? ''} ${item.label ?? ''} ${item.token ?? ''}`.toLowerCase();
  if (/(padding|margin|gap|space|inset|offset)/.test(text)) return 'spacing';
  return 'sizing';
}

function getCategory(item) {
  const kind = normalizeKind(item.kind);
  if (kind === 'space') return inferSpaceKind(item);
  if (kind === 'shadow') return 'shadows';
  return kind;
}

// Must be unique per row, not just per token — two rows can legitimately share the exact
// same part+token (e.g. Textarea's padding.top/bottom/start/end are all the literal same
// --helix-primitive-spacing-75, since the field has uniform padding on every side). Using
// only part+token here previously collided those rows onto one key, so hovering any one of
// them lit up all four at once (React `key` reuse + a single `hoveredRow` string matching
// every row with that colliding key). `label` (plus state/size/variant, when set) is what
// actually distinguishes them — always include it, never fall back to it only when token
// is absent.
function rowKeyFor(item) {
  return [item.part, item.label, item.token ?? item.value ?? '', item.state ?? '', item.size ?? '', item.variant ?? ''].join('|');
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

function TokensPanel({ active }) {
  const api = useStorybookApi();
  const currentStory = api.getCurrentStoryData?.();
  // `args` only holds values the story/user actually set; a prop's component-level
  // default (e.g. Button's `size = 'm'`) lives in `initialArgs` instead. Merge both so
  // filtering narrows to the real default even before anyone touches a control.
  const currentArgs = { ...currentStory?.initialArgs, ...currentStory?.args };
  const tokens = currentStory?.parameters?.helixTokens ?? [];
  // Lets a consuming project outside Helix point this addon at its own DOM/highlight
  // convention via `parameters.helixTokensConfig`, without forking the addon — see
  // constants.js. Defaults reproduce Helix's own current behavior exactly.
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
    return () => cancelAnimationFrame(raf1);
    // Re-check shortly after story navigation AND after any arg change (e.g. toggling a
    // control that conditionally renders a part, like Card's `header`) — both can change
    // which `data-helix-part` elements actually exist in the preview DOM.
  }, [currentStory?.id, JSON.stringify(currentArgs)]);

  const presentParts = React.useMemo(() => getPresentParts(), [currentStory?.id, JSON.stringify(currentArgs), paintTick]);

  // The preview iframe reloads its story on navigation — a highlight left over from a
  // hovered row in the previous story would otherwise point at DOM that no longer exists.
  React.useEffect(() => {
    return () => channel.emit(HELIX_HIGHLIGHT_EVENT, null);
  }, [channel, currentStory?.id]);

  function highlightComponent(item) {
    setHoveredRow(item ? rowKeyFor(item) : null);
    channel.emit(
      HELIX_HIGHLIGHT_EVENT,
      item
        ? { part: item.part, variant: item.variant, category: getCategory(item), token: item.token, value: item.value, label: item.label, meta: item.meta, axis: item.axis, config }
        : null,
    );
  }

  const categories = React.useMemo(() => {
    const present = CATEGORY_ORDER.filter(kind => tokens.some(item => getCategory(item) === kind && matchesStoryState(item, currentArgs, presentParts)));
    return present;
  }, [tokens, currentArgs, presentParts]);

  React.useEffect(() => {
    if (!categories.length) return;
    if (!categories.includes(category)) {
      setCategory(categories[0]);
    }
  }, [category, categories]);

  const filtered = React.useMemo(
    () => tokens.filter(item => getCategory(item) === category && matchesStoryState(item, currentArgs, presentParts)),
    [tokens, category, currentArgs, presentParts],
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
      ].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [filtered]);

  const showPreviewColumn = category === 'color';

  return React.createElement(
    AddonPanel,
    { active },
    React.createElement(
      'div',
      { style: { padding: '24px', overflowX: 'auto' } },
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
                border: `1px solid ${category === item ? PANEL_ACCENT : 'var(--helix-color-border-neutral, #e2e8f0)'}`,
                borderRadius: 999,
                padding: '4px 9px',
                fontSize: 11,
                background: category === item ? PANEL_ACCENT_SOFT : 'var(--helix-color-fill-surface, #f8fafc)',
                color: category === item ? PANEL_ACCENT : 'var(--helix-color-text-neutral, #0f172a)',
                cursor: 'pointer',
                font: 'inherit',
              },
            },
            CATEGORY_LABELS[item] ?? item,
          ),
        ),
      ),
      uniqueFiltered.length > 0
        ? React.createElement(
            'table',
            { style: TABLE_STYLE },
            React.createElement(
              'thead',
              null,
              React.createElement(
                'tr',
                null,
                React.createElement('th', { style: { ...TH_STYLE, width: showPreviewColumn ? '32%' : '38%' } }, 'Element'),
                React.createElement('th', { style: { ...TH_STYLE, width: showPreviewColumn ? '48%' : undefined, borderRight: showPreviewColumn ? '1px solid var(--helix-color-border-neutral-light, #f1f5f9)' : 'none' } }, 'Token'),
                showPreviewColumn ? React.createElement('th', { style: { ...TH_STYLE, borderRight: 'none' } }, 'Preview') : null,
              ),
            ),
            React.createElement(
              'tbody',
              null,
              uniqueFiltered.map(item => {
                const tokenText = item.token ?? item.value ?? '';
                const key = rowKeyFor(item);
                const isHovered = hoveredRow === key;
                return React.createElement(
                  'tr',
                  {
                    key,
                    onMouseEnter: () => highlightComponent(item),
                    onMouseLeave: () => highlightComponent(null),
                    style: { background: isHovered ? PANEL_ACCENT_SOFT : 'transparent' },
                  },
                  React.createElement(
                    'td',
                    { style: TD_STYLE },
                    item.label || item.part,
                    // Several rows can legitimately share one Element label (default/hover/press
                    // of the same fill) — without this they read as duplicate rows. The state
                    // badge is what actually tells them apart at a glance.
                    item.state
                      ? React.createElement('span', {
                          style: {
                            marginLeft: 6,
                            fontSize: 10,
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: '0.03em',
                            color: 'var(--helix-color-text-neutral-lightest, #64748b)',
                            border: '1px solid var(--helix-color-border-neutral, #e2e8f0)',
                            borderRadius: 4,
                            padding: '1px 5px',
                          },
                        }, item.state)
                      : null,
                  ),
                  React.createElement(
                    'td',
                    { style: { ...TD_STYLE, borderRight: showPreviewColumn ? TD_STYLE.borderRight : 'none', overflow: 'hidden' } },
                    React.createElement('code', { style: { fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' } }, tokenText),
                    item.meta ? React.createElement('span', { style: { display: 'block', marginTop: 2, fontSize: 11, color: 'var(--helix-color-text-neutral-lightest, #64748b)' } }, item.meta) : null,
                  ),
                  showPreviewColumn
                    ? React.createElement(
                        'td',
                        { style: { padding: '10px 12px', verticalAlign: 'middle', borderBottom: '1px solid var(--helix-color-border-neutral-light, #f1f5f9)' } },
                        React.createElement('span', {
                          title: item.token ? `var(${item.token})` : item.value ?? '',
                          style: {
                            display: 'inline-block',
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            border: '1px solid var(--helix-color-border-neutral, #e2e8f0)',
                            // resolvePreviewColor reads the REAL value from the preview iframe —
                            // a bare var(--helix-*) written here never resolves (this panel's own
                            // document doesn't define that custom property; see the function's
                            // own comment). Falls back to the unresolved var()/literal only if
                            // the iframe read fails, so the swatch degrades instead of crashing.
                            backgroundColor: (item.token && resolvePreviewColor(item.token))
                              || (item.token ? `var(${item.token})` : item.value ?? ''),
                          },
                        }),
                      )
                    : null,
                );
              }),
            ),
          )
        : React.createElement('p', { style: { margin: '16px 0 0', color: 'var(--helix-color-text-neutral-light, #475569)' } }, 'No tokens defined for this category.'),
    ),
  );
}

addons.register(ADDON_ID, (api) => {
  addons.add(PANEL_ID, {
    id: PANEL_ID,
    type: types.PANEL,
    title: 'Tokens',
    disabled: parameters => !parameters?.helixTokens?.length,
    render: ({ active }) => React.createElement(TokensPanel, { active }),
  });
});
