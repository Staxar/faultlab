# Extension Architecture

## Structure

extension/

background/
content/
devtools/
popup/
sidepanel/

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

Responsibilities:

- diagnostics
- request inspection

### Content Script

Responsibilities:

- page instrumentation
- UI mutations
