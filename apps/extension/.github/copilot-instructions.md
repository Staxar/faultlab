# FaultLab Copilot Instructions

You are working on FaultLab.

Read these documents before generating code:

1. docs/copilot-context.md
2. docs/vision.md
3. docs/architecture.md
4. docs/rule-engine.md
5. docs/security.md

Project rules:

- TypeScript only
- React only
- Manifest V3 only
- Side Panel is primary UI
- Everything Local By Default

The current MVP uses React state and plain TypeScript. Zustand, Zod, and Tailwind are future options, not installed dependencies; do not introduce them without an explicit task.

Architecture principles:

- Business logic belongs in core/
- UI belongs in apps/extension
- Shared contracts belong in shared/

Never couple UI with Chrome APIs directly.
Use adapters.

Prefer extensible architecture over shortcuts.

Implementation details:

- Store runtime state under `faultlab.runtime` in `chrome.storage.local` and initialize it from `defaultScenarios`.
- Keep core exports browser-neutral; put Chrome debugger and storage integration under `apps/extension/src`.
- The background service worker is emitted as `background.js`; update `manifest.json` when permissions or entry points change.
- Use `pnpm typecheck` for workspace checks and `pnpm build` to produce `dist/` for loading as an unpacked extension.
