# FaultLab architecture

`@faultlab/core` is browser-independent. The extension owns Chrome APIs. The background service worker
currently owns state, session policy, and the Chrome Debugger adapter. Core provides types, validation,
matching, scenario generation, and JSON mutation helpers; there is no separate runtime Scenario Engine
class yet.

```ts
class ChromeNetworkAdapter {
  stop(): Promise<void>;
  applyRules(tabId: number, rules: FaultRule[], recording?: boolean, monitoring?: boolean): Promise<void>;
}
```

Keep Chrome-specific objects out of core. The first production vertical slice is:

Side Panel -> Background -> Network Adapter -> selected tab -> injected network behavior -> observed response.

The current flow is Side Panel -> runtime message -> background service worker -> `ChromeNetworkAdapter` ->
selected tab. The content script reports recorder events and runtime/unhandled rejection issues back to the
background. DevTools, popup, and options integration are not implemented.

For JSON Mutation in MVP 0.2, the adapter pauses both Fetch request and response stages. It reads a matched
response with `Fetch.getResponseBody`, delegates transformation to `packages/core`, and completes a changed
response with `Fetch.fulfillRequest`. Invalid, unreadable, non-JSON, and oversized bodies use response
passthrough. Unexpected adapter errors use best-effort continuation, but restricted pages or detached tabs
can still prevent a successful continuation.

Error Observatory derives grouped findings in the browser-neutral core from detected issues. The adapter
records successful injections while monitoring is active and attaches the nearest matching injection context
to later issues by request ID or a bounded time/origin heuristic. This is best-effort until a shared CDP
request identity is introduced.
