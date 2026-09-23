export const TOKENS_HIGHLIGHT_EVENT = 'tokens-storybook-addon/highlight';

// A fixed lilac, not a design token — this is a dev-tool inspector color (like a browser's
// element-highlight overlay), deliberately independent of the story's own light/dark theme
// so it reads clearly against either background.
export const TOKENS_HIGHLIGHT_COLOR = '#8b5cf6';
export const TOKENS_HIGHLIGHT_COLOR_SOFT = 'rgba(139, 92, 246, 0.16)';

// Defaults can be overridden by a consuming project through parameters.tokensAddon.
export const DEFAULT_CONFIG = {
  // Matches `data-token-part="..."` on the DOM node a token affects (see CONTRACT.md).
  dataAttribute: 'data-token-part',
  // Matches `data-variant="..."` used to scope a color row to one variant instance.
  variantAttribute: 'data-variant',
  highlightColor: TOKENS_HIGHLIGHT_COLOR,
  highlightColorSoft: TOKENS_HIGHLIGHT_COLOR_SOFT,
  // Custom properties that define a Text Style in the preview's CSS. Capture group 1 is the
  // style name, group 2 the property — e.g. `--ds-textStyle-body-m-semibold-fontSize`.
  textStylePattern: '^--(?:.*-)?textStyle-(.+)-(fontFamily|fontSize|fontWeight|lineHeight)$',
};

export function resolveConfig(parameters) {
  return { ...DEFAULT_CONFIG, ...(parameters?.tokensAddon ?? {}) };
}
