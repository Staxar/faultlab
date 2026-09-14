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

Keep Chrome-specific behavior behind the background service worker and the runtime-message boundary. The
Side Panel may call the small `send()` runtime messaging helper, but must not use `chrome.debugger`,
`chrome.storage`, or `chrome.tabs` directly.

Prefer extensible architecture over shortcuts.

Implementation details:

- Store runtime state under `faultlab.runtime` in `chrome.storage.local` and initialize it from `defaultScenarios`.
- Keep core exports browser-neutral; put Chrome debugger and storage integration under `apps/extension/src`.
- The background service worker is emitted as `background.js`; update `manifest.json` when permissions or entry points change.
- Use `pnpm typecheck` for workspace checks and `pnpm build` to produce `dist/` for loading as an unpacked extension.
- Use `pnpm dev` and open `/sidepanel.html` for fast UI feedback. The development-only Chrome mock must not
  be imported into production behavior or treated as a real browser integration test.
- `content/main.ts` is active for recorder navigation/click/change events and runtime/unhandled rejection
  reports. Do not add UI mutation behavior there without an explicit design and permission review.
- Recorder and error monitoring are local, bounded, selected-tab sessions. Persist only metadata needed by
  the UI; do not persist request bodies, form values, or matched response bodies.
- Handle `ACTIVATE_SCENARIO` and `DEACTIVATE_SCENARIO` failures visibly. Every paused Fetch request or
  response must have a best-effort continuation path when injection cannot be applied.
- `devtools/main.ts` is deferred; do not add DevTools permissions or entry points implicitly.
