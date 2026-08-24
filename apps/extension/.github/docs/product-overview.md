# Product Overview

FaultLab consists of seven primary modules.

## Network Chaos

Implemented today: tab-level latency and bandwidth throttling, per-request delay, offline failure, and
selected HTTP error responses. Packet loss, random latency, and richer network presets are planned.

## API Chaos

Implemented today: request-stage delay, offline failure, selected HTTP error responses, and response-stage
JSON mutation. Timeout, weighted random outcomes, custom response bodies, and one-click request breaking
are planned.

## Data Chaos

Mutate:

- missing fields
- null values
- wrong types
- empty arrays
- payload stress

MVP 0.2 starts with JSON response mutation for Fetch/XHR requests. It supports removing fields, setting fields to `null`, replacing values with empty arrays, and applying representative type mismatches. MVP 0.3 provides a Side Panel editor for built-in rules and local custom scenarios with multiple rules, bounded per-request limits, and broad-matcher confirmation.

## Browser Chaos

Planned. CPU, viewport, geolocation, timezone, user-agent, and media-feature emulation are not currently
implemented.

Simulate:

- CPU throttling
- timezone
- dark mode
- viewport
- geolocation

## UI Chaos

Planned. FaultLab does not currently hide, resize, delay, or mutate page UI.

Stress:

- text overflow
- broken images
- missing elements

## Scenario Engine

Combines multiple chaos sources in the long-term design. The current runtime uses typed scenario rules in
core and applies them through the background network adapter.

## Recorder

The first recorder slice observes network requests, navigation, clicks, and form changes locally while the
user browses the selected tab. Users can review the journey timeline, select observed requests, and create
a custom scenario containing delay rules for those endpoints. Replay and richer action inference remain
future work.

## Error Detection

The first monitoring slice collects console errors, failed network requests, runtime exceptions, and unhandled Promise rejections locally for the selected tab. The Side Panel shows the latest issues and supports clearing the local list.

Grouping and failure correlation are available in the current development slice. DOM/performance detection,
export, Auto Chaos, and full reports are planned.
