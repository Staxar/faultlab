# Product Overview

FaultLab consists of seven primary modules.

## Network Chaos

Inject:

- Offline
- Slow 3G
- Slow 4G
- High latency
- Random latency
- Packet loss

## API Chaos

Inject:

- 500
- 404
- 401
- 403
- 429
- 503
- timeout
- delays

## Data Chaos

Mutate:

- missing fields
- null values
- wrong types
- empty arrays
- payload stress

MVP 0.2 starts with JSON response mutation for Fetch/XHR requests. It supports removing fields, setting fields to `null`, replacing values with empty arrays, and applying representative type mismatches. MVP 0.3 now provides a Side Panel editor for configuring built-in rules; custom scenario authoring is the next slice.

## Browser Chaos

Simulate:

- CPU throttling
- timezone
- dark mode
- viewport
- geolocation

## UI Chaos

Stress:

- text overflow
- broken images
- missing elements

## Scenario Engine

Combines multiple chaos sources.

## Recorder

Records user journeys.
