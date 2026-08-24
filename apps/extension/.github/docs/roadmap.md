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

Status: complete and included in `0.1.0`.

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

Out of scope for 0.2 and the `0.1.0` release: request-body mutation, headers as matchers, response-code matchers, JSONPath, schema generation, and custom scenario CRUD.

## MVP 0.3 - Scenario Builder

Status: partially complete; the current slice is included in `0.1.0`.

The first 0.3 slice is configuration of the existing presets, followed by creation and persistence of custom scenarios. It should remain a small Side Panel workflow rather than a full rule-authoring platform.

Milestones:

1. Configure Backend Down, Slow Network, Offline, and Bad Data defaults. Side Panel editor, local update, validation, and reset are implemented.
2. Select request scope with literal URL substring, HTTP method, resource type, or an observed GraphQL operation name.
3. Configure probability and action parameters with bounded validation.
4. Add optional per-activation application limits.
5. Add custom scenarios with one or more rules, local persistence, and safe reset/delete behavior.

The current implementation edits existing built-in scenarios, discovers GraphQL operation names after page reload, and stores updated scenarios under `faultlab.runtime`. Custom scenario CRUD, application limits, and built-in/custom separation remain for the next 0.3 slice.

Completion criteria:

- every editable value has a default, range, and visible validation error;
- broad matchers require an explicit confirmation before activation;
- built-in defaults can be restored;
- custom scenarios cannot be saved without a valid rule;
- built-in scenarios cannot be corrupted by custom edits;
- all configuration remains local and applies to the selected tab only.

Not part of 0.3: regex or wildcard matchers, headers/body matching, response mutation authoring, rule scheduling, rule sequences, multi-tab orchestration, sharing, analytics, and undo/redo.

## MVP 0.4 - Recorder

- record a user journey;
- turn selected observations into a repeatable scenario;
- keep recorded data local by default.

## MVP 0.5 - Error Detection

Monitor:

- console errors;
- network failures;
- runtime errors;
- unhandled promise rejections.

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
