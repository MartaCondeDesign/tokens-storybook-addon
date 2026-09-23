# Contribution Instructions

This repository is an isolated Storybook addon. Keep it independent from any specific
design system, token package, CSS framework, component library, or AI provider.

When changing the addon:

- Preserve the public `parameters.tokens` contract unless the contract and migration path
  are updated together.
- Keep DOM selectors configurable through `parameters.tokensAddon`.
- Add one example for every new token kind or category.
- Make preview highlights explain the measured property; do not use a generic outline for
  spacing, sizing, or color when a more precise treatment is possible.
- Update `README.md` and `CONTRACT.md` when behavior or data fields change.
- Run `pnpm pack --pack-destination /tmp/tokens-storybook-addon` before publishing.

For component consumers, inspect the component's rendered DOM and CSS before documenting
tokens. Use the exact `data-token-part` value, document every distinct side and gap, and
never document a token that the component does not actually consume.

Value column rules (see CONTRACT.md → "Value column rules"): values are snapshotted and must never
change on hover; Spacing and Sizing values are always px; Typography shows the component token in Token,
the detected Text Style as its description, and all four Text Style values in one row.
Spacing uses logical `start`/`end` sides, never `left`/`right`, and its px value appears only in
the Value column, never painted on the component.
Hidden components (closed Modal/Toast/Tooltip) still list every token, tagged HIDDEN. A token is
never shown as hardcoded. Color text rows are split per kind of text. Motion is its own last category.
Element names are unique per section: a token-derived suffix is added only when names clash.
