# Architecture

## Architecture Layers

UI
↓
Application Layer
↓
Scenario Engine
↓
Rule Engine
↓
Browser Adapters

## Design Principles

- Separation of concerns
- Event-driven communication
- Strong typing
- Adapter-based browser integration
- Extensible chaos system

---

## Runtime Flow

Side Panel

↓

Background Service Worker

↓

Scenario Engine

↓

Rule Engine

↓

Browser Adapter

↓

Chrome APIs

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

If the body is not valid JSON or cannot be read, the adapter continues the original response unchanged with `Fetch.continueResponse`.
