# Contribution Instructions

This repository is an isolated Storybook addon. Keep it independent from any specific
design system, token package, CSS framework, or component library.

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
