# Architecture

## Architecture Layers

Side Panel UI
↓
Background service worker
↓
Browser adapters and local state
↓
Chrome APIs

`packages/core` supplies browser-neutral types, validation, matching, and mutation helpers. It is not a
separate runtime service yet.

## Design Principles

- Separation of concerns
- Event-driven communication
- Strong typing
- Adapter-based browser integration
- Extensible chaos system

---

## Runtime Flow

Side Panel -> runtime message -> Background Service Worker -> state validation/persistence ->
`ChromeNetworkAdapter` -> selected tab -> Chrome Debugger Protocol.

The content script reports recorder navigation/interactions and runtime/unhandled Promise issues back to the
background. Recorder and error monitoring are local, bounded sessions owned by one selected tab. DevTools,
popup, and options integration are not implemented.

## JSON Mutation Flow

For MVP 0.2 response mutation:

Side Panel

-> Background Service Worker

-> Network Adapter

-> Fetch request stage

-> selected tab response stage

-> `Fetch.getResponseBody`

-> browser-independent JSON mutation in `packages/core`

-> `Fetch.fulfillRequest` with the mutated response

If the body is not valid JSON or cannot be read, the adapter continues the original response unchanged with `Fetch.continueResponse`. Unexpected request and response errors also use a best-effort continuation path; restricted pages and detached tabs remain browser limitations.
