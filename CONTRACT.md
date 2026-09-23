# Helix Tokens Panel Contract

The Storybook addon reads `parameters.helixTokens` from the active story and renders a custom tab.

Helix's own `data-helix-part`/`data-variant` DOM convention and lilac highlight color are
just this addon's *defaults* — a project using this addon outside Helix can override both
via `parameters.helixTokensConfig` in its own `.storybook/preview.ts`, with no fork
required. See `README.md` → "Using this addon outside Helix" for the config shape; this
file documents Helix's own usage of the contract (the default config), not the override
mechanism itself.

Each token item must follow this shape:

```ts
{
  part: string;
  label: string;
  token?: string;
  value?: string;
  kind?: 'color' | 'typography' | 'space' | 'radius' | 'shadow' | 'other';
  variant?: string;
  size?: string;
  state?: 'hover' | 'press' | 'disabled' | 'focus';
  axis?: 'horizontal' | 'vertical';
  meta?: string;
}
```

For `spacing` rows, `axis` records which direction the gap actually runs in the component's real layout
(a `flex-direction: column` gap is `'vertical'`, a row gap is `'horizontal'`), so the dimension line draws
the correct way instead of assuming horizontal — set it on every `spacing` row. `sizing` rows almost never
need it (sizing defaults to `'vertical'` — the component's own height, which is what "sizing" means in
nearly every case) — only set `axis: 'horizontal'` on a `sizing` row when the token is genuinely a *width*
measurement (e.g. Switch's track width), never for height/box-size tokens.

Tabs appear above the table, always in this order, and only when the current story has
at least one token of that kind: **Color, Typography, Spacing, Radius, Sizing, Shadows**.
`space`-kind items split into the `Spacing` or `Sizing` tab automatically — `spacing` if
the part/label/token text matches `padding|margin|gap|space|inset|offset`, `sizing`
otherwise (e.g. `field.height`, `control.size`).

Table columns are **Element, Token** always, plus **Preview** — but the Preview column
only exists on the **Color** tab (a swatch). No other tab gets a Preview column at all;
`meta` (e.g. `Body small`) renders as a small caption line under the Token cell instead.
When `state` is set, the Element cell also appends a small uppercase badge (`HOVER`/`PRESS`/
`DISABLED`) after the label — several rows legitimately share one label (a fill's default/
hover/press are all "fill.primary"), and without the badge they read as duplicate rows.

Rules:

- Only show the tab at all when the active story defines `parameters.helixTokens`.
- Only show tabs for `kind`s present in the current story, in the fixed order above.
- `label` should describe the UI element or semantic role, not just the token name.
- `meta` should be used for typography notes like `Body small` or `Caption / label`.
- `value` → use when the component has a hardcoded value instead of a token; show the
  literal value in the Token column (works even without a `token` — `resolvePx` in
  `preview.js` falls back to `item.value` the same way the table does).
- `variant` → when the current story has `args.variant`, EVERY category (not just
  color) only shows tokens whose own `variant` matches — a `space`/`radius`/etc. item
  with no `variant` field always shows regardless of the selected variant.
- `size` → same mechanism as `variant`, but against `args.size`. A row tagged with a
  size (e.g. a `fontSize`/`height`/`padding` rung that genuinely differs per size) only
  shows for the currently selected size; a row with no `size` field is size-agnostic and
  always shows (e.g. `gap.icon.text`, which doesn't change across sizes). This is what
  keeps `Typography` from listing every rung the component has ever had — only the one
  rung actually rendered on screen right now.
- `state` → `'disabled'` is opt-in: a row tagged `state: 'disabled'` only shows once the
  story's own `args.disabled` is actually `true` — showing a disabled-state color by
  default would misrepresent what's currently on screen. `'hover'`/`'press'` are the
  opposite: NEVER gated behind a control (these components don't expose a "state" arg for
  pointer states), always shown whenever the component is interactive, tagged only so the
  Element/meta column can say *which* state a given row represents. **Only tag `state` on
  a row when the resolved CSS var driving that visual state actually exists and is
  consumed by the component's CSS** — do not document a `disabled`/`hover` token that the
  component's stylesheet never references (e.g. `--helix-checkbox-fill-disabled` exists as
  a token but Checkbox's disabled look is opacity-only, not a fill swap — don't add a row
  for it; a documented-but-unused token would show a live-highlight color that never
  actually appears on screen).
- **Every `spacing`/`sizing` relationship the component actually has must get a row** —
  not just the first gap that comes to mind. Audit the component's CSS for: `padding-top`,
  `padding-bottom`, `padding-start`/`padding-left`, `padding-end`/`padding-right` (as four
  separate rows — asymmetric padding, e.g. Select's wider trailing edge for its chevron, is
  real and worth seeing as two different values, not one shared "padding" row), and every
  `gap` between two visually distinct children in either axis: icon↔text, label↔field,
  control↔content, element↔element, whatever the component actually lays out. A `0`/literal
  side (no token backing it) still gets a row with `value: '0'` — the point is completeness
  of "what spacing exists here", not just "which spacings have a token." **Every `gap` row
  needs its `axis` set too** — check the actual `flex-direction` of the parent that owns the
  gap (`padding-top`/`padding-bottom` are always `'vertical'`, `padding-start`/`padding-end`
  are always `'horizontal'`; a `gap` row's axis follows whatever direction that specific
  flex container runs in, which is *not* always the same for every gap in one component —
  Input's `input-root` is `column` (gap.label.field → vertical) while its icon slot sits
  inline with the field (horizontal), so don't assume one axis for the whole component).
- **Icon/adornment slots are the easiest spacing to forget — check them explicitly, every
  time.** A leading/trailing icon almost always carries its own padding independent of the
  field's own padding: an outer edge (wrapper-to-icon) AND an inner "gap.icon.text" (icon-
  to-typed-text) — two separate rows, not one. `input-icon`/`input-icon-end` in Input and
  `select-chevron` in Select are exactly this shape (grep the component's CSS for the icon's
  own `data-helix-part` selector — `padding-left`/`padding-right`/`right` on that specific
  part, not on the field/trigger). Missing these was the actual gap found and fixed here —
  don't assume "I covered the field's padding" also covers the icon.
- **`part` must match the component's own `data-helix-part` value exactly** — the live
  highlight (below) does a literal `[data-helix-part="<part>"]` lookup, so a `part` that
  doesn't exist in the DOM (e.g. a leftover bare `'input'` when the real attribute is
  `'input-root'`) silently produces zero highlight, not an error. When a component has
  more than one meaningfully different sub-part (e.g. `input-wrapper` carries fill/border,
  `input-field` carries value text + height, `input-label` carries the label color), point
  each row at the *specific* part that CSS actually applies that property to — not a
  single root part for everything, even if the component also happens to have one.
- **Two rows are allowed to share the exact same `part` + `token`/`value`** — e.g.
  Textarea's `padding.top`/`padding.bottom`/`padding.start`/`padding.end` are all
  genuinely the same `--helix-primitive-spacing-75` (uniform padding on every side). Only
  `label` (plus `state`/`size`/`variant` when set) actually tells those rows apart, so
  `rowKeyFor` in `register.js` builds its key from the full tuple
  (`part, label, token ?? value, state, size, variant`) — never from `part` + `token`/`value`
  alone. Regressing that key back to a shorter tuple silently merges every row with the
  same token onto one `hoveredRow` string, so hovering any one of them re-highlights all
  of them at once (confirmed with Textarea's padding rows) — check `rowKeyFor` first if a
  hover ever seems to light up more than the one row the cursor is actually over.

## Hover → live-component highlight

Hovering any cell in a row does not glow the row's own preview swatch — it highlights
the real, live component instance in the preview canvas, via the manager↔preview channel
event `HELIX_HIGHLIGHT_EVENT` (`packages/storybook-addon-tokens/constants.js`). The panel
emits `{ part, variant, category, token, value, label, meta }` on `onMouseEnter` (`category`
is the resolved tab, not the raw `kind`) and `null` on `onMouseLeave`, unmount, or story
change; `preview.js` finds the target element(s) via `[data-helix-part="<part>"]`
(scoped to `[data-variant="<variant>"]` when set and a match exists) and applies a
**category-specific** treatment — never a generic outline for every kind:

| Category | What actually happens on the component | Why |
|---|---|---|
| `color` | The token's own CSS custom property is overridden inline to lilac (`el.style.setProperty(item.token, LILAC)`) | Shows exactly which pixels that specific token drives — not just "this element has some color token" |
| `typography` | `refineTypographyTarget` narrows to the `-label`/`-description`/`-error`/`-placeholder`/`-value`/`-counter` descendant matching the row's `label`/`meta` text, then overrides its `color` (not the font itself) to lilac | The row's `part` is usually the component root, not the specific text node — narrowing avoids recoloring the whole component (icons included, via `currentColor`) |
| `radius` | A `3px solid lilac` outline, **flush** to the edge — `outline-offset: 0` (`.helix-token-highlight-radius`) | Traces the rendered corner curve itself. An inset offset (an earlier version used `-3px`) reads as "there is padding/space here", which is a different token's job — radius is only ever about the corners |
| `shadows` | `box-shadow` is overridden inline to a lilac elevation shadow | Shows the shadow's shape/spread in the highlight color, not just an unrelated outline |
| `spacing` | A "dimension line" overlay, drawn on the row's own `axis` (`'horizontal'`/`'vertical'`, falls back to horizontal if unset), whose length equals the token's own resolved **px value** — never the component's own width/height, and **no outline** on the component itself. The pill label spells out the axis too (`"8px · H"`) | It's measuring a gap/inset, not the component — a line as long as the component would misrepresent an 8px gap as "however wide the button is"; an outline here would read as a `border` color highlight, which is a different token's job; and a spacing gap is genuinely NOT always horizontal (a `flex-direction: column` gap is vertical) |
| `sizing` | Same dimension line, defaulting to **vertical**, spanning the component's own **rendered height** (`getBoundingClientRect().height`) — also no outline. The one exception: a row explicitly tagged `axis: 'horizontal'` (a genuinely width-typed sizing token, e.g. Switch's track width) spans the component's **rendered width** instead | Sizing is the component's own total extent — height in the overwhelming majority of cases, so that's the default, but a handful of tokens really do measure width instead, and forcing those into a vertical line would show the wrong dimension entirely; the exception is opt-in per row, never guessed from the label |

Dimension lines prefer drawing **outside** the component (right for `sizing`'s vertical
line, bottom for `spacing`'s horizontal line) and only fall back to hugging the
component's own edge from the inside when the viewport leaves no room outside — this
outside/inside choice applies to `padding.*` rows (the container's own edge) and to
`sizing`.

**A `gap.*` row is positioned differently: precisely in the actual gap between the two
children it measures**, not relative to the container's outer corner (`findGapChildren` /
`tightContentRect` in `preview.js`). Two things make this harder than it sounds, both
confirmed as real regressions along the way — check both if a gap indicator ever looks
"floating" or disconnected from the real content again:
1. **A flex child stretches to fill its parent's CROSS axis by default**
   (`align-items: stretch`), regardless of the child's own `display`. A row nested inside a
   `flex-direction: column` parent (e.g. Switch's track+label row, itself a child of the
   column-flex `switch-root`) gets stretched to the parent's full WIDTH even though it's
   `inline-flex` — its own `getBoundingClientRect()` reports that fake, stretched extent,
   not where its content actually ends. `tightContentRect` corrects for this — but **only
   on the CROSS axis** (width for a vertical gap, height for a horizontal one); the
   measured axis itself is accurate on the plain rect and must be left alone. Correcting
   both axes is wrong the other way: recursing into a `switch-track` button's single child
   (the small thumb circle) to "tighten" its box would shrink the *track* — which is not
   stretched and whose own outer box is the real visual pill shape — down to just the thumb.
2. **A leaf with direct text (no element children, e.g. a `<span>` description) can't be
   tightened via a children union** — there's nothing to recurse into. `tightContentRect`
   falls back to `Range.selectNodeContents(el).getBoundingClientRect()` for those, which
   measures the actually-rendered text instead of the (possibly also stretched) span's own
   box.

When `findGapChildren` can't find exactly two laid-out children on the container (e.g. an
icon-only slot, or a padding row, or `isSizing`), it returns `null` and `drawDimensionLine`
falls back to the generic container-relative line described in the table above.

This depends on every component rendering `data-helix-part="<part>"` (matching the
`part` used in its `.doc.ts` `tokens[]`, per the naming rule above) on the DOM node the
token actually affects, and `data-variant="<variant>"` on that same node when the
component has variants.
