# Tokens Storybook Addon Contract

The addon reads `parameters.tokens` from the active story and renders a Tokens panel.
Hovering a row highlights the corresponding element in the preview iframe.

## Token item

```ts
type TokenKind =
  | 'color'
  | 'typography'
  | 'space'
  | 'radius'
  | 'shadow'
  | 'other';

type TokenItem = {
  part: string;
  label: string;
  token?: string;
  value?: string;
  kind?: TokenKind;
  colorRole?: 'background' | 'text' | 'border' | 'icon' | 'asset';
  padding?: 'all' | 'top' | 'end' | 'bottom' | 'start' | string;
  paddingSides?: Array<'top' | 'end' | 'bottom' | 'start'>;
  relationship?: 'text-to-text' | 'header-to-text' | 'icon-to-text' | 'icon-to-header' | 'element-to-element' | 'element-to-text' | string;
  variant?: string;
  size?: string;
  state?: 'hover' | 'press' | 'disabled' | 'focus';
  axis?: 'horizontal' | 'vertical';
  meta?: string;
};
```

`token` is a CSS custom property, such as `--color-action-primary`. Use `value` for a
literal value such as `0` or `1px`. A row must provide one of them.

## Filtering and categories

The panel shows categories in this order: Color, Typography, Spacing, Sizing, Radius,
Shadows, and Other. `space` rows are shown as Spacing when their text contains
`padding`, `margin`, `gap`, `space`, `inset`, or `offset`; otherwise they are shown as
Sizing.

Rows tagged with `variant` or `size` are shown only when the active story args match.
Disabled rows appear only when `args.disabled` is true. Hover and press rows are shown
without a state control because they describe interactive states.

Every distinct padding side and layout gap should have its own row. Set `axis` to the
direction of the measured spacing. For sizing, the default axis is vertical; set
`axis: 'horizontal'` only for a width measurement.

Display names must be unique within a category. The addon appends a suffix derived from
the DOM part when the same label appears more than once: `text-header`,
`text-description`, `text-caption`, or `padding-card-body`.

Padding rows use `padding: 'all'` for the four sides, a single side such as `top`, or
`paddingSides` for combinations such as `['top', 'end']`. The preview paints only those
zones with a translucent lilac layer and shows the pixel value in the table. Spacing rows
are relationships between named elements, such as `icon-to-text` or `header-to-text`,
not padding on the container.

Color rows must declare the surface they describe with `colorRole`: `background`, `text`,
`border`, `icon`, or `asset`. For an asset, use the most specific DOM part for each
recolorable layer when the illustration contains multiple colors.

## DOM contract

Each `part` must match the configured `dataAttribute` on the live element. The default is
`data-token-part`:

```ts
parameters: {
  tokensAddon: {
    dataAttribute: 'data-token-part',
    variantAttribute: 'data-variant',
  },
}
```

The variant attribute scopes a row when the same part is rendered more than once.

## Highlight behavior

| Category | Preview behavior |
| --- | --- |
| `color` | Overrides the row's CSS custom property with the highlight color. |
| `typography` | Highlights the matching text descendant. |
| `radius` | Draws an outline around the element's rendered corners. |
| `shadow` | Replaces the element's shadow with the highlight shadow. |
| `space` | Draws a dimension line on the row's axis. |
| `other` | Uses the generic element highlight. |

The manager and preview communicate through the private event
`tokens-storybook-addon/highlight`. Consumers should not depend on that event; use the
documented story parameters and DOM attributes instead.

## Value column rules

- **Values never change on hover.** Every value read from the preview DOM is snapshotted once
  per story / args change. Hovering a row repaints the element in the highlight color, so a
  live read at that moment would report the highlight instead of the applied token.
- **Spacing and Sizing are always shown in px.** A token written in `rem`, `em`, `%` or
  `calc()` is converted; a row with no matching CSS property (e.g. `height.m`, `size`) is
  measured from the rendered element. An empty Value cell for a `space` row is a bug.
- **Hidden components still show all their tokens.** When none of a story's declared parts is
  visible (a closed Modal, a Toast before it fires, a Tooltip before hover), every row is shown
  and tagged `HIDDEN`; values are read from the token itself. A component that is on screen
  still hides sub-parts the story doesn't render (Card without a header).
- **Applied tokens first, hardcoded values last — a token is never shown as hardcoded.** Text
  on screen that no row documents is looked up in the CSS: if a token colors it, the row shows
  that token (and is skipped if the token is already documented); only text with no token
  behind it shows its raw value, tagged `hardcoded`.
- **Color is split into sections:** BACKGROUND, BORDER, one TEXT section per kind of text
  (`TEXT · VALUE`, `TEXT · PLACEHOLDER`, `TEXT · LABEL`…), ICON. Value and placeholder are
  different categories, never one "text" pile.
- **Motion is its own category, last.** Duration / easing / delay tokens go under Motion, never
  Sizing, and keep their authored value (`200ms`, `cubic-bezier(…)`) — never converted to px.
- **Element names are unique within a section — suffix only on a clash.** A suffix is added
  ONLY when two or more rows in the same section would have the same name, and it is what tells
  them apart, taken from their tokens: `border` ×4 → `border-default`, `border-checked`,
  `border-focus`, `border-invalid` (state / variant / size / part when the tokens don't differ).
  A row whose name is already unique never gets a suffix.
- **Casing: section headers are always UPPERCASE; element names are always lowercase.**
- **Spacing sides are logical: `start` / `end`, never `left` / `right`.** Use
  `padding.start` / `padding.end` labels and `paddingSides: ['start', 'end']`. They follow
  the element's writing direction (RTL-safe). Legacy `left`/`right` input is still accepted
  and mapped, but new rows must not use it.
- **Spacing numbers appear only in the Value column, never on the component.** Hovering a
  Spacing row paints the zone (visible fill + dashed edge) with no px label. A `0` value
  paints nothing.
- **Gaps are drawn between the two named elements.** `gap.control.description` /
  `icon-to-text` name them: the preview finds `*-control` and `*-description` in the
  component and paints from the first element's edge to where the second's content starts,
  across the second element's extent — not a strip on the row's own element.
- **Color rows tint, never outline.** A color row without a token (computed from rendered
  CSS) tints the real property it describes (`color`, or `border-color` for borders) with the
  highlight color, exactly like token rows.
- **Typography Token column has one line per property** — font-family, font-size,
  font-weight, line-height — each showing the component token that property consumes,
  aligned with the same line in Value. A property with no component token reads
  `no component token` rather than being hidden. The Text Style name is the description
  underneath.
- **Typography is one row per text element.** The addon detects which Text Style the text
  renders with — custom properties matching `textStylePattern` (default
  `--{prefix}textStyle-{name}-{fontFamily|fontSize|fontWeight|lineHeight}`), matched against
  what the element renders. Token shows the component's own typography token(s) (e.g.
  `--button-font-size-m`) with the Text Style name as the description underneath
  (`Caption / Semibold`); Value shows all four properties of that Text Style. font-size +
  font-weight identify the style; line-height and font-family only rank candidates. When no
  style has that size + weight, the description reads `No Text Style` and Value lists the
  rendered values. Override the pattern through the
  addon config parameter if your system names Text Styles differently.

## Contribution rule

A new token type or category must include all of the following:

- A data shape and filtering rule.
- A meaningful preview highlight, not just a label in the panel.
- A story example showing the type in use.
- Documentation for how Claude or another coding agent should create the rows.
- A clean Storybook or package validation run.
