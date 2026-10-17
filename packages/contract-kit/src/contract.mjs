/* contract-kit: keep two implementations of one rule set from drifting apart.
   Everything in core.mjs (runs anywhere) plus `guarded` (Node only). In a browser or a bundler for the web, import 'contract-kit/core' instead.
   Copyright (c) 2026 LFC Foundry. MIT License. */
export * from './core.mjs';
export { guarded } from './guarded.mjs';
