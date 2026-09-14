# Local Development

FaultLab has two ways to verify the Side Panel.

## Vite UI mode

From the repository root:

```bash
pnpm install
pnpm dev
```

Open:

```text
http://127.0.0.1:5173/sidepanel.html
```

If port `5173` is occupied, Vite selects another port and prints the exact URL. Use the
`/sidepanel.html` path; the Vite root is not an application entry point.

This mode enables `src/sidepanel/dev-chrome.ts` only in development. It mocks the runtime messaging API
and provides sample requests, findings, notes, and screenshot evidence. It is intended for rapid UI and
workflow feedback. It does not attach Chrome Debugger, mutate real responses, inspect real tabs, or test
content-script behavior.

Vite serves the page directly from source, so React and CSS changes appear live through hot module
replacement. Keep the Vite process running while editing; a browser refresh is only needed if the
development page itself gets into a stale state.

## Real extension mode

To test Chrome APIs and real pages:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Then load `apps/extension/dist` as an unpacked extension from `chrome://extensions`. Use this mode for
Chrome Debugger interception, real recorder events, content-script error reports, `captureVisibleTab`,
and manifest/permission checks.

## Boundaries

- Vite mock state exists only in the current browser page and resets on refresh.
- Real extension state is stored under `faultlab.runtime` in `chrome.storage.local`.
- The mock must stay development-only and must not be used as a substitute for Chrome acceptance checks.
