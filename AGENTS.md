# FaultLab Agent Guidelines

## Project Shape

- This is a pnpm workspace for a Chrome/Chromium Manifest V3 extension.
- `packages/core` is the browser-independent rule engine and type source of truth.
- `apps/extension` owns React/Vite UI, the background service worker, and Chrome APIs.
- Keep Chrome-specific objects and APIs out of `packages/core`; put browser integration behind an extension-side adapter.
- Read [docs/architecture.md](docs/architecture.md) for the intended Side Panel -> Background -> Network Adapter flow.
- Read [apps/extension/.github/docs/copilot-context.md](apps/extension/.github/docs/copilot-context.md) for product scope and [apps/extension/.github/copilot-instructions.md](apps/extension/.github/copilot-instructions.md) for extension-specific guidance.

## Build and Validation

- Use Node.js 20+ and pnpm 10+ (`pnpm@10.15.0`). Run `pnpm install` before working from a fresh checkout.
- `pnpm build` typechecks and bundles the extension into `apps/extension/dist`.
- `pnpm typecheck` runs TypeScript checks across all workspace packages.
- `pnpm test` runs Vitest regression tests for browser-independent core behavior.
- `pnpm dev` starts the extension's Vite development server at `127.0.0.1`.
- There is currently no configured linter or formatter; do not assume ESLint or Prettier commands exist. Browser adapter and UI behavior still need manual or mocked checks.
- After a build, load `apps/extension/dist` as an unpacked extension from `chrome://extensions` when manual verification is needed.

## Implementation Conventions

- Use ESM and strict TypeScript with an ES2022 target. Preserve the existing package and `@faultlab/*` naming conventions.
- When changing core types or behavior, update [packages/core/src/index.ts](packages/core/src/index.ts) and keep its public exports browser-neutral.
- The extension build aliases `@faultlab/core` directly to `packages/core/src`; update [apps/extension/vite.config.ts](apps/extension/vite.config.ts) if package resolution changes.
- Runtime state is stored in Chrome local storage under `faultlab.runtime`; preserve that key and initialize state from `defaultScenarios`.
- Scenario edits and resets are handled by the `UPDATE_SCENARIO` and `RESET_SCENARIO` runtime messages; validate them before persistence.
- The Manifest V3 service worker is bundled as `background.js`; update [apps/extension/manifest.json](apps/extension/manifest.json) when permissions or extension entry points change.
- Keep shared message contracts in [apps/extension/src/shared/messages.ts](apps/extension/src/shared/messages.ts) and Chrome debugger integration in [apps/extension/src/background/network-adapter.ts](apps/extension/src/background/network-adapter.ts).
- Keep JSON mutation transformations in [packages/core/src/mutations.ts](packages/core/src/mutations.ts); the adapter should only handle CDP body transport and response continuation.
- `apps/extension/src/content/main.ts` is active page instrumentation for recorder events and runtime/unhandled rejection reports; keep it free of UI mutation logic.
- `apps/extension/src/devtools/main.ts` remains a reserved placeholder until DevTools integration is deliberately implemented.
- Scenario activation and deactivation are handled by the `ACTIVATE_SCENARIO` and `DEACTIVATE_SCENARIO` runtime messages; surface their errors in the Side Panel.
- Recorder and error monitoring are local, bounded sessions for one selected tab. Do not silently switch either session to another tab.
- Treat persisted `faultlab.runtime` data and incoming runtime messages as untrusted; normalize and validate them before use or persistence.

## Documentation

- Use [README.md](README.md) for setup, MVP scope, and roadmap details.
- Use [docs/architecture.md](docs/architecture.md) for component boundaries and the `NetworkAdapter` contract.
