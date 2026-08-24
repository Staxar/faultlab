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

Then build and load `apps/extension/dist` from `chrome://extensions` → Load unpacked.

## Build

```bash
pnpm build
pnpm typecheck
```

## Current Status

The first public release is `0.1.0`. It includes the completed network-chaos baseline, JSON response mutation, built-in preset configuration, and discovery of observed endpoints, GraphQL operations, and JSON fields. Non-JSON or unreadable responses pass through unchanged.

Custom scenario CRUD, application limits, and multi-tab orchestration remain outside this release and are planned for future updates.

## Release

See [docs/releasing.md](docs/releasing.md) for the release checklist and Chrome Web Store publication steps.
