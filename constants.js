export const HELIX_HIGHLIGHT_EVENT = 'helix-ds/storybook-addon-tokens/highlight';

// A fixed lilac, not a design token — this is a dev-tool inspector color (like a browser's
// element-highlight overlay), deliberately independent of the story's own light/dark theme
// so it reads clearly against either background.
export const HELIX_HIGHLIGHT_COLOR = '#8b5cf6';
export const HELIX_HIGHLIGHT_COLOR_SOFT = 'rgba(139, 92, 246, 0.35)';

// Everything here is Helix-specific by DEFAULT only — a consuming project can override any
// of it via `parameters.helixTokensConfig` in its own `.storybook/preview.ts`, without
// forking this addon. This is what makes the addon reusable outside Helix: the DOM
// convention it looks for (`dataAttribute`/`variantAttribute`) and the highlight color are
// the only things it actually depends on functionally — everything else (which CSS var a
// given row highlights) comes from the consumer's own `.doc.ts`-equivalent data, already
// prefix-agnostic.
export const DEFAULT_CONFIG = {
  // Matches `data-helix-part="..."` on the DOM node a token affects (see CONTRACT.md).
  dataAttribute: 'data-helix-part',
  // Matches `data-variant="..."` used to scope a color row to one variant instance.
  variantAttribute: 'data-variant',
  highlightColor: HELIX_HIGHLIGHT_COLOR,
  highlightColorSoft: HELIX_HIGHLIGHT_COLOR_SOFT,
};

export function resolveConfig(parameters) {
  return { ...DEFAULT_CONFIG, ...(parameters?.helixTokensConfig ?? {}) };
}
