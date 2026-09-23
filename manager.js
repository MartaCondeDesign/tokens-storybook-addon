// No CSS import here on purpose — the manager (this file's context) is a separate
// document from the preview iframe, with no reason to assume a sibling `tokens` package
// exists. register.js's own chrome styling uses token variables with fallbacks
// throughout, so it degrades to sensible neutral colors when a host project's tokens
// aren't loaded in the manager, instead of hard-depending on this monorepo's layout.
import './register.js';
