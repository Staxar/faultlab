# FaultLab

Browser extension for controlled failure injection in web applications.

## Starter MVP

- Chrome/Chromium Manifest V3
- React + Vite side panel
- Background service worker
- Browser-independent rule engine
- Backend Down / Slow Network / Offline / Bad Data presets
- JSON response mutation for Fetch/XHR requests
- Local runtime state

## Requirements

- Node.js 20+
- pnpm 10+
- Chrome/Chromium

## Run

```bash
pnpm install
pnpm dev
```

For local UI work, open `http://127.0.0.1:5173/sidepanel.html`. If that port is already in use, Vite
prints the next available port, for example `http://127.0.0.1:5174/sidepanel.html`.

The Vite page runs with a development-only Chrome API mock, so scenarios, recorder data, error findings,
notes, screenshots, and exports can be exercised without loading an unpacked extension. This mode uses
sample local data and does not intercept real browser requests. For real Chrome Debugger behavior, build
and load `apps/extension/dist` from `chrome://extensions` -> Load unpacked.

## Build

```bash
pnpm build
pnpm typecheck
```

## Current Status

The first public release was `0.1.0`. Version `0.2.0` added local custom scenario CRUD, per-request application limits, broad-matcher confirmation, a bounded request timeout action, a network recorder with a local journey timeline, local error detection, Error Observatory findings, investigation notes, screenshots, and local Markdown/PDF export. Version `0.2.1` fixes screenshot capture fallback and runtime session cleanup. Non-JSON or unreadable responses pass through unchanged.

Custom scenario CRUD is available in the development branch after `0.1.0`: create, edit, persist, and delete local scenarios with one or more rules. Multi-tab orchestration, richer redaction, and advanced Error Observatory analysis remain planned for future updates.

## Release

The current development version is not yet tagged. See [CHANGELOG.md](CHANGELOG.md) for the `0.2.1` scope and [docs/releasing.md](docs/releasing.md) for the release checklist and Chrome Web Store publication steps.
