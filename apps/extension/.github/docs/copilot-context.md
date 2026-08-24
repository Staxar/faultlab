# FaultLab Context

FaultLab is a browser-based chaos engineering platform for web applications.

Mission:

Break your app before your users do.

Core Modules:

- Network Chaos
- API Chaos
- Data Chaos
- Browser Chaos
- UI Chaos
- Scenario Engine
- Recorder
- Reporting

Project Stack:

- TypeScript
- React
- Vite
- Manifest V3

Planned options, not current dependencies:

- Tailwind
- Zustand
- Zod

Architecture Rules:

- Keep business logic inside core/
- Keep UI inside apps/extension
- Use adapters for Chrome APIs
- Everything Local By Default
- Security first

Current Development Target:

MVP 0.2 - JSON Mutation

Completed foundation:

Features:

- Backend Down
- Offline
- Slow Network
- request delays
- HTTP failures
- network throttling
- Side Panel
- local runtime state

Current slice:

- `Bad Data` mutates JSON responses for matching Fetch/XHR API requests.
- Supported mutations are field removal, nullification, empty arrays, and representative type mismatches.
- Non-JSON, unreadable, or oversized responses pass through unchanged.

Current development slice:

MVP 0.3 makes presets configurable and supports local custom scenarios with multiple rules, bounded per-request application limits, and broad-matcher confirmation. Error detection belongs to MVP 0.5.
