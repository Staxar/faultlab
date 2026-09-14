# Chrome Web Store listing preparation

This document contains the release text and reviewer information for FaultLab 0.2.0.

## Short description

Test web applications by injecting controlled network, timeout, offline, HTTP, and JSON data failures.

## Detailed description

FaultLab is a local-first Chrome Side Panel for testing how web applications behave when dependencies
fail.

Use the built-in scenarios or create local custom scenarios to:

- return selected HTTP error responses;
- add request latency;
- simulate offline requests or bounded request timeouts;
- throttle tab-level network bandwidth;
- remove, nullify, empty, or type-mismatch JSON response fields;
- record request and navigation metadata for a selected tab;
- monitor local console, runtime, Promise, and network failures;
- add investigation notes and optional screenshot evidence;
- export a local Markdown report or print a local PDF report.

FaultLab does not use a backend, account, analytics service, or team synchronization. Runtime state,
recordings, findings, notes, and screenshots remain in the browser's local extension storage. Request and
response bodies are not persisted. Matched JSON response bodies are read temporarily in memory only when
JSON mutation is active.

FaultLab is intended for developers testing applications they own or are authorized to test. Review
exported reports and screenshots before sharing them because application URLs, source paths, error
messages, and screenshots may contain sensitive information.

## Permission justifications

### `debugger`

FaultLab uses the Chrome Debugger Protocol to pause selected-tab network requests, apply controlled
failures, throttle traffic, read matched response bodies for local JSON mutation, and observe selected
console/runtime/network events during an explicitly started session.

### `activeTab`

FaultLab uses the user-invoked active tab for visible screenshot capture and selected-tab workflows.

### `tabs`

FaultLab reads the active tab ID, URL, and window ID to attach to the selected tab and capture its visible
content.

### `storage`

FaultLab stores scenarios and bounded recorder, Error Observatory, note, and screenshot state locally.

### `sidePanel`

FaultLab provides its primary user interface as a Chrome Side Panel.

### Content scripts

The HTTP(S) content script records navigation and interaction milestones and reports runtime errors and
unhandled Promise rejections only for a selected local recording or monitoring session. It does not store
form values or request bodies.

## Reviewer verification

1. Load the unpacked `apps/extension/dist` directory.
2. Open a normal HTTP(S) test page and open the FaultLab Side Panel.
3. Activate Backend Down, Slow Network, Offline, and Bad Data one at a time.
4. Confirm that deactivation restores normal traffic.
5. Start and stop recording, select an observed request, and create a scenario.
6. Start and stop error monitoring, capture a screenshot, save a note, and export a report.
7. Confirm that no network request is made to a FaultLab service.

## Required submission materials

- `faultlab-0.2.0.zip` with `manifest.json` at the archive root;
- the 128px extension icon from `apps/extension/public/icons/icon-128.png`;
- at least one production UI screenshot without the development banner;
- the public URL for [`PRIVACY.md`](../PRIVACY.md), hosted where the Chrome Web Store reviewer can access it;
- the permission justifications above.
