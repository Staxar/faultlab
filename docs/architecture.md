# FaultLab architecture

`@faultlab/core` is browser-independent. The extension owns Chrome APIs. The network adapter currently exposes:

```ts
interface NetworkAdapter {
  stop(): Promise<void>;
  applyRules(tabId: number, rules: FaultRule[]): Promise<void>;
}
```

Keep Chrome-specific objects out of core. The first production vertical slice is:

Side Panel -> Background -> Network Adapter -> selected tab -> injected network behavior -> observed response.

For JSON Mutation in MVP 0.2, the adapter pauses both Fetch request and response stages. It reads a matched response with `Fetch.getResponseBody`, delegates transformation to `packages/core`, and completes a changed response with `Fetch.fulfillRequest`. All non-JSON and error cases use `Fetch.continueResponse` passthrough.
