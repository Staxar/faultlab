# Changelog

All notable FaultLab changes are documented here.

## [0.2.0] - 2026-08-26

### Added

- local custom scenarios with multiple rules;
- per-request application limits and broad-matcher confirmation;
- local network recorder with navigation, click, and form-change timeline;
- local error monitoring for console, network, runtime, and unhandled Promise failures;
- Error Observatory findings with best-effort injection correlation and filters;
- investigation notes and optional visible-tab screenshot evidence;
- local Markdown export and print-friendly PDF reports;
- request timeout action with a bounded 100-60000 ms interval;
- Vitest regression coverage for browser-independent core behavior.

### Security and behavior

- runtime state remains under `faultlab.runtime` in Chrome local storage;
- recorder, monitoring, notes, and evidence are bounded and scoped to one selected tab;
- request bodies, form values, and response bodies are not persisted by these features;
- Markdown export applies basic token/query redaction, but exported files and screenshots still require review before sharing.

### Known limitations

- injection correlation is best-effort across Chrome DevTools Protocol event types;
- PDF export uses the browser print dialog and its `Save as PDF` action;
- Browser Chaos, UI Chaos, Auto Chaos, DOM/performance detection, rich redaction, DevTools, CLI, integrations, and team workflows are not included;
- release still requires manual Chrome verification because no end-to-end browser test suite is configured.

## [0.1.0] - First public release

The initial release included network chaos, JSON response mutation, built-in preset configuration, and endpoint/GraphQL/JSON field discovery. See `docs/releasing.md` for the original release scope.
