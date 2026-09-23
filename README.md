# Helix Storybook Tokens Addon

Adds a "Tokens" tab to the Storybook manager for any `Components/*` story that defines
`parameters.helixTokens`. Hovering a row highlights the real, live component in the
preview canvas — see `CONTRACT.md` for the full data contract and hover-behavior spec.

## Install in a Storybook project

```bash
pnpm add -D @helix-ds/storybook-addon-tokens
```

Register the addon by its package name in `.storybook/main.ts`:

```ts
import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  addons: ['@helix-ds/storybook-addon-tokens'],
};

export default config;
```

The addon does not require `@helix-ds/tokens`. Token names and values come from each
story's `parameters.helixTokens` data, so it can be used with any design-token system.

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

## Using this addon outside Helix

Only two things are functionally Helix-specific — everything else (which CSS var a row
highlights, its kind/label/etc.) comes from the consumer's own token data, already
prefix-agnostic:

1. The DOM convention it looks for on the live component (`data-helix-part="..."`, and
   `data-variant="..."` to scope a color row to one variant instance).
2. The lilac highlight color used for every hover treatment.

Override either from your own `.storybook/preview.ts`, no fork required:

```ts
// .storybook/preview.ts
export default {
  parameters: {
    helixTokensConfig: {
      dataAttribute: 'data-part',      // default: 'data-helix-part'
      variantAttribute: 'data-variant', // default: 'data-variant'
      highlightColor: '#8b5cf6',        // default: '#8b5cf6' — pass a hex color
      highlightColorSoft: 'rgba(139, 92, 246, 0.35)',
    },
  },
};
```

Defaults reproduce Helix's own current behavior exactly, so this is opt-in — Helix itself
never needs to set `helixTokensConfig`. The panel's own chrome (tabs, table borders) reads
`var(--helix-color-*, <fallback>)` throughout, so it renders with sensible neutral colors
even when a host project's own Helix-named tokens aren't loaded in the Storybook manager —
no CSS import required from this package.

## Guidelines (see CONTRACT.md for the full, authoritative version)

- The tab itself only appears for stories that define `parameters.helixTokens`.
- Tabs render in a fixed order — Color, Typography, Spacing, Radius, Sizing, Shadows —
  and only for kinds present in the current story.
- `variant`/`size` narrow a row to the story's current `args`; `state: 'disabled'` rows
  are opt-in (only show once `args.disabled` is true); `hover`/`press` rows always show.
- Every padding side and every gap between visually distinct children (icon↔text,
  label↔field, ...) gets its own row — not just the first one that comes to mind.
- `part` must match the component's own DOM attribute value exactly, and should point at
  the most specific part that actually carries the property (not always the root).
