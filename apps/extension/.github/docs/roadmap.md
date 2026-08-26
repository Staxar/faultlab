# FaultLab Roadmap

## MVP 0.1 - First Public Release

Status: complete.

Implemented capabilities:

- network latency and bandwidth throttling
- offline request failures
- per-request delay
- HTTP failure responses
- React side panel
- Backend Down, Slow Network, and Offline presets
- local runtime state for the active tab

The first public version is `0.1.0`. It is a release snapshot of the current working MVP, rather than a strict feature boundary: it includes the network-chaos baseline, JSON response mutation, built-in preset configuration, and universal discovery available at release time.

## MVP 0.2 - JSON Mutation

Status: complete. The initial implementation shipped in the historical `0.1.0` snapshot; the current
development line is `0.2.0`.

Scope:

- remove a JSON field
- set a JSON field to `null`
- replace a JSON field with an empty array
- replace a JSON field with a representative value of another type
- match response rules against Fetch and XHR requests
- preserve the original response when the body is not valid JSON or cannot be read

Implementation order:

1. Keep mutation logic browser-independent in `packages/core`.
2. Add response-stage interception to the Chrome network adapter.
3. Add the `Bad Data` demonstration preset.
4. Verify valid JSON, missing paths, non-JSON responses, large bodies, and debugger failures.

Out of scope: request-body mutation, headers as matchers, response-code matchers, JSONPath, and schema generation.

## MVP 0.3 - Scenario Builder

Status: substantially complete in `0.2.0` development.

The first 0.3 slice is configuration of the existing presets, followed by creation and persistence of custom scenarios. It should remain a small Side Panel workflow rather than a full rule-authoring platform.

Milestones:

1. Configure Backend Down, Slow Network, Offline, and Bad Data defaults. Side Panel editor, local update, validation, and reset are implemented.
2. Select request scope with literal URL substring, HTTP method, resource type, or an observed GraphQL operation name.
3. Configure probability and action parameters with bounded validation.
4. Add optional per-activation application limits. Implemented for per-request actions with bounded values from 1 to 1000.
5. Add custom scenarios with one or more rules, local persistence, and safe delete behavior. Implemented: create, edit, add/remove rules, and delete custom scenarios.

The current implementation edits existing built-in scenarios, discovers GraphQL operation names after page reload, and stores updated scenarios under `faultlab.runtime`. Custom scenarios are separated from built-ins and can be created, edited, and deleted locally in the `0.2.0` development version. Per-request application limits and explicit broad-matcher confirmation are implemented. Throttle remains a tab-level setting; multi-tab coordination remains future work.

Completion criteria:

- every editable value has a default, range, and visible validation error;
- broad matchers require an explicit confirmation before activation;
- built-in defaults can be restored;
- custom scenarios cannot be saved without a valid rule;
- built-in scenarios cannot be corrupted by custom edits;
- all configuration remains local and applies to the selected tab only.

Not part of 0.3: regex or wildcard matchers, headers/body matching, response mutation authoring, rule scheduling, rule sequences, multi-tab orchestration, sharing, analytics, and undo/redo.

## MVP 0.4 - Recorder

Status: first recording slice implemented in the current development line.

- record up to 500 unique network requests locally;
- record navigation, click, and form-change milestones locally;
- select observed requests in the Side Panel;
- turn selected observations into a custom scenario with one delay rule per unique request;
- keep recorded data in `faultlab.runtime` and discard it only when the user clears it.

Remaining recorder work: support richer generated actions and add explicit session controls such as pause/resume and event filtering.

## MVP 0.5 - Error Detection

Status: first local monitoring slice implemented in the current development line.

Monitor locally:

- console errors;
- network failures;
- runtime errors;
- unhandled promise rejections.

The Side Panel can start, stop, and clear monitoring for the selected tab. It keeps up to 500 issues and
500 injections in `faultlab.runtime`, displays grouped findings, and shows matching scenario/rule context
when available. Findings can be filtered by source or correlation, and local notes, screenshots, Markdown
export, and PDF printing are available. Historical reports, richer redaction, and DOM/performance detection
remain future work.

## Immediate Stabilization

The current stabilization branch addresses runtime correctness before adding more chaos types:

- scenario activation and deactivation are handled end to end;
- paused requests and responses have best-effort fail-open continuation;
- persisted state and runtime messages are normalized and deeply validated;
- recorder and monitoring sessions are bound to one selected tab;
- browser-independent core regression checks are in place; adapter and Side Panel behavior still require manual or mocked browser checks.

## Next Product Slice - Error Observatory

Status: first local correlation slice implemented and merged into `master`.

The Side Panel groups repeated issues into local findings and correlates an issue with the latest matching
injection context when available: scenario, rule, action, request, and timestamp. Response bodies, request
bodies, and form values are not stored. Local notes, screenshots, Markdown export, PDF printing, and
view-only filters are implemented. Remaining work: explicit investigation sessions, better request identity
across CDP domains, and richer redaction controls. Do not add server sync, AI, Jira, or GitHub in this slice.

## MVP 1.0

- Auto Chaos;
- reports;
- Jira integration;
- GitHub integration.

## MVP 2.0

- CLI;
- Playwright integration;
- CI integration;
- shared workspaces.
