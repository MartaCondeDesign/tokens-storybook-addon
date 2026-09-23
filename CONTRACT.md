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
  padding?: 'all' | 'top' | 'right' | 'bottom' | 'left' | string;
  paddingSides?: Array<'top' | 'right' | 'bottom' | 'left'>;
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

Padding rows use `padding: 'all'` for the four sides, a single side such as `top`, or
`paddingSides` for combinations such as `['top', 'right']`. The preview paints only those
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

## Contribution rule

A new token type or category must include all of the following:

- A data shape and filtering rule.
- A meaningful preview highlight, not just a label in the panel.
- A story example showing the type in use.
- Documentation for how Claude or another coding agent should create the rows.
- A clean Storybook or package validation run.
