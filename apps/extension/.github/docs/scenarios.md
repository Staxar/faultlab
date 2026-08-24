# Scenarios

The `0.1.0` release exposes built-in presets in the Side Panel. The `0.2.0` development builder makes their rules configurable and also supports local custom scenarios with one or more rules. Sections explicitly marked "MVP 0.3" describe the remaining builder work.

## Common Rule Controls

Every configurable rule should expose:

- enabled/disabled state;
- a literal URL substring in `urlIncludes`;
- one or more HTTP methods;
- one or more Chrome resource types;
- an optional GraphQL operation selected from operations observed after a page refresh;
- a JSON field selected from response structure observed after a page refresh;
- probability from 0% to 100% for per-request actions;
- an optional maximum number of applications, reset when the scenario is activated.

An empty matcher means all requests visible to the adapter. The UI asks for confirmation before activating a scenario with an enabled empty matcher. MVP 0.3 uses literal, case-sensitive URL matching and a GraphQL operation name extracted from `operationName` or a named `query`, `mutation`, or `subscription` definition. Response fields are discovered as JSON Pointer paths; array elements are represented with `*`, for example `/items/*/id`. Regex, headers, request bodies, and response statuses are deferred.

When multiple rules match one request, the first matching rule in scenario order wins for request-stage actions. A per-request rule with an application limit stops matching after its limit is reached; the count resets when the scenario is applied again. A `throttle` rule is different: it configures the selected tab globally and has no per-request application limit. Requests that match no rule continue unchanged.

## Backend Down

Purpose: make selected API requests fail with an HTTP response.

Configurable in MVP 0.3:

- failure probability, default 100%;
- HTTP status, default 500; allowed values are 401, 403, 404, 408, 429, 500, 502, 503, and 504;
- URL substring, default empty;
- HTTP methods, default GET, POST, PUT, PATCH, and DELETE for Fetch/XHR;
- resource types, default `fetch` and `xhr`;
- optional application limit.

Example: fail 70% of `POST` requests whose URL contains `/api/payment` with status 500. The remaining 30% continue normally. A timeout is a separate future action and is not represented by the HTTP failure control.

## Slow Network

Purpose: make the selected tab behave like a degraded connection.

Configurable in MVP 0.3:

- latency, default 800 ms;
- download bandwidth, default 500 KB/s;
- upload bandwidth, default 500 KB/s;
- URL substring, methods, and resource types for the optional request delay;
- request delay probability, default 100% for Fetch/XHR;
- optional delay application limit.

Bandwidth and latency are tab-level Network emulation. The request delay is applied per intercepted Fetch/XHR request. A per-request probability must not be presented as if it selectively enabled tab-level throttling; the UI should label these controls separately.

## Offline

Purpose: fail selected requests as disconnected.

Configurable in MVP 0.3:

- failure probability, default 100%;
- URL substring, methods, and resource types;
- optional application limit.

The default matcher is broad and should require an activation warning. `Fetch.failRequest` may not behave identically for top-level navigation, browser-internal pages, extension pages, or other restricted URLs. The Side Panel should surface an adapter error instead of claiming that those pages are offline.

## Bad Data

Available in MVP 0.2 as a demonstration preset and configurable in the first MVP 0.3 editor:

- matches Fetch/XHR responses;
- can be narrowed to a selected GraphQL operation such as `SearchResultItemV2`;
- removes the `/id` JSON field;
- applies with probability 100%.

After activating the scenario, refresh the target page. The adapter reads names from the request `operationName` or from named GraphQL definitions such as `query SearchResultItemV2(...)`, and parses JSON response fields into a selectable path list. The observed operation names and paths become available in the editor selects. A wildcard path applies the mutation to every matching array item. MVP 0.3 mutation authoring supports `remove`, `nullify`, `empty_array`, and `type_mismatch` only.

## Custom Scenarios

Custom scenarios can be created from the Side Panel with one or more rules. Each custom scenario supports the same matcher and action controls as the built-in presets, is stored under `faultlab.runtime`, and can be edited or deleted. Built-in scenarios cannot be deleted or converted into custom scenarios. Deleting the active custom scenario deactivates network interception first.

## Future Examples

These examples are useful acceptance scenarios for the builder, but are not built-in presets in the current MVP:

### Checkout From Hell

- payment API: 500 response;
- cart API: request delay;
- all checkout requests: degraded network;
- each rule has a visible matcher and probability.

### Selective Payment Failure

- URL contains `/api/payment`;
- method is `POST`;
- resource type is `fetch` or `xhr`;
- 70% probability of status 500;
- no effect on reads or unrelated endpoints.

## Configuration Safety

Every setting needs a default and bounded validation. A scenario cannot be saved without at least one valid rule. Resetting a built-in preset restores its safe defaults. Per-request application limits are bounded from 1 to 1000 and reset when the scenario is applied again. Configuration remains local to the extension and applies to the selected tab; multi-tab coordination and sharing are later work.
