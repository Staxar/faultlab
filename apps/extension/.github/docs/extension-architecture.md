# Extension Architecture

## Structure

The current extension contains `background`, `content`, and `sidepanel` entry points. `devtools` is a
placeholder for future work; popup and options surfaces are not implemented.

## Components

### Background Service Worker

Responsibilities:

- state synchronization
- browser integration
- storage

### Side Panel

Responsibilities:

- user interaction
- scenario management

### DevTools Panel

Status: planned. Do not describe a DevTools panel or add its permissions without a separate feature.

### Content Script

Responsibilities:

- recorder navigation, click, and form-change events;
- runtime error and unhandled Promise rejection reports.

UI mutation and content stress features are not implemented.

### Selected-tab sessions

The background owns the active debugger attachment. Recording and error monitoring are local, bounded
sessions tied to one selected tab. The Side Panel communicates through runtime messages; it does not use
Chrome debugger or storage APIs directly.
